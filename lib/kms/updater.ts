import { Duration, Stack } from "aws-cdk-lib";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import path from "path";

interface Registry {
  [key: string]: Set<string> | false;
}

export interface CrossAccountKmsKeyManagerProps {
  keyId: string;
  keyAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
}

/**
 * CrossAccountKmsKeyManager creates a Lambda function and calls it at deployment
 * time using an AwsCustomResource (Lambda:InvokeFunction).
 *
 * @remarks
 * - `keyId` should be the ID of the KMS key in the other account whose
 *   policy we want to manage.
 * - `keyAwsId` should be the ID of the AWS account the aforementioned key
 *   belongs to.
 * - `managerTimeout` is optional and specifies the number of seconds for the manager
 *   Lambda Function's timeout (defaults to 30).
 * - `callerTimeout` is optional and specifies the number of seconds for the
 *   AwsCustomResource's timeout (defaults to 30).
 * - To use this construct, first register the resources that need to access a given
 *   KMS key using one of the following static registry functions:
 *   - allowCloudfront(keyId, cloudfrontId)
 */
export class CrossAccountKmsKeyManager extends Construct {
  /** Static registry mapping keyIds to CloudFront Distribution IDs that need access */
  private static cloudfrontRegistry: Registry = {};
  /** Static registry mapping to CloudFront Distribution IDs to KMS permissions */
  private static cloudfrontPermissionsRegistry: Registry = {};

  /**
   * Returns a sorted list of the set of Cloudfront Distribution IDs in the registry and
   * sets the manager to created
   */
  private static consumeCloudfrontAccessors(keyId: string): string[] {
    const accessors = [
      ...(this.cloudfrontRegistry[keyId] ? this.cloudfrontRegistry[keyId] : []),
    ].sort();
    this.cloudfrontRegistry[keyId] = false;
    return accessors;
  }

  /**
   * The Lambda Function that will be called to assume a role cross-account and
   * manage the KMS Key
   */
  public readonly function: Function;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountKmsKeyManagerProps,
  ) {
    super(scope, id);

    const {
      keyId,
      keyAwsId,
      managerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
      callerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
    } = props;

    const xaMgmtRoleArn = `arn:aws:iam::${keyAwsId}:role/${keyId}-xa-mgmt`;
    const assumeXaMgmtRole = new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["sts:AssumeRole"],
          resources: [xaMgmtRoleArn],
        }),
      ],
    });

    const role = new Role(this, "xa-mgmt-lambda-role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      description: `Execution role for ${keyId} manager Lambda function.`,
      inlinePolicies: {
        assumeXaMgmtRole,
      },
      roleName: `${keyId}-xa-mgmt-ex`,
    });

    this.function = new Function(this, "xa-mgmt-lambda", {
      code: Code.fromAsset(path.join(__dirname, "lambda-code")),
      handler: "main.handler",
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(managerTimeout),
      environment: {
        XA_MGMT_ROLE_ARN: xaMgmtRoleArn,
        KEY_ID: keyId,
        ACCESSOR_ACCOUNT_ID: Stack.of(this).account,
        ACCESSOR_STACK_NAME: Stack.of(this).stackName,
      },
      role,
    });

    const cloudfrontDistributionIds =
      CrossAccountKmsKeyManager.consumeCloudfrontAccessors(keyId);
    const cloudfrontAccessors: { [key: string]: string[] } = {};
    for (const id in cloudfrontDistributionIds) {
      const actions =
        CrossAccountKmsKeyManager.cloudfrontPermissionsRegistry[id];
      if (actions) {
        cloudfrontAccessors[id] = [...actions].sort();
      }
    }

    const callFor = (operation: string) => {
      return {
        physicalResourceId: PhysicalResourceId.of("xa-mgmt-lambda-caller"),
        service: "Lambda",
        action: "InvokeFunction",
        parameters: {
          FunctionName: this.function.functionName,
          InvocationType: "Event",
          Payload: JSON.stringify({
            operation,
            cloudfrontAccessors,
          }),
        },
      };
    };

    new AwsCustomResource(this, "xa-mgmt-lambda-caller", {
      onCreate: callFor("create"),
      onUpdate: callFor("update"),
      onDelete: callFor("delete"),
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.function.functionArn],
      }),
      timeout: Duration.seconds(callerTimeout),
    });
  }

  /**
   * Grant access to the given cross-account KMS key to the specified Cloudfront
   * Distribution ID
   * Optionally specify a list of actions
   * (default: [
   *  "kms:Decrypt",
   *  "kms:Encrypt",
   *  "kms:GenerateDataKey*",
   *  "kms:DescribeKey"
   * ])
   */
  public static allowCloudfront(
    keyId: string,
    cloudfrontId: string,
    actions?: string[],
  ) {
    if (this.cloudfrontRegistry[keyId] === false) {
      throw new Error(
        `Cannot register resources for key ${keyId} manager after creation.`,
      );
    }
    actions ??= [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ];
    this.cloudfrontRegistry[keyId] ??= new Set<string>();
    this.cloudfrontRegistry[keyId].add(cloudfrontId);
    this.cloudfrontPermissionsRegistry[cloudfrontId] = new Set(actions);
  }
}
