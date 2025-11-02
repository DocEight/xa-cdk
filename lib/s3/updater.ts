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

export interface CrossAccountS3BucketManagerProps {
  bucketName: string;
  bucketAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
}

/**
 * CrossAccountS3BucketManager creates a Lambda function and calls it at deployment
 * time using an AwsCustomResource (Lambda:InvokeFunction).
 *
 * @remarks
 * - `bucketName` should be the name of the S3 bucket in the other account whose
 *   policy we want to manage.
 * - `bucketAwsId` should be the ID of the AWS account the aforementioned bucket
 *   belongs to.
 * - `managerTimeout` is optional and specifies the number of seconds for the manager
 *   Lambda Function's timeout (defaults to 30).
 * - `callerTimeout` is optional and specifies the number of seconds for the
 *   AwsCustomResource's timeout (defaults to 30).
 * - To use this construct, first register the resources that need to access a given
 *   S3 Bucket using one of the following static registry functions:
 *   - allowCloudfront(bucketName, cloudfrontId)
 */
export class CrossAccountS3BucketManager extends Construct {
  /** Static registry mapping bucketNames to CloudFront Distribution IDs that need access */
  private static cloudfrontRegistry: Registry = {};
  /** Static registry mapping to CloudFront Distribution IDs to S3 permissions */
  private static cloudfrontPermissionsRegistry: Registry = {};

  /**
   * Returns a sorted list of the set of Cloudfront Distribution IDs in the registry and
   * sets the manager to created
   */
  private static consumeCloudfrontAccessors(bucketName: string): string[] {
    const accessors = [
      ...(this.cloudfrontRegistry[bucketName]
        ? this.cloudfrontRegistry[bucketName]
        : []),
    ].sort();
    this.cloudfrontRegistry[bucketName] = false;
    return accessors;
  }

  /**
   * The Lambda Function that will be called to assume a role cross-account and
   * manage the S3 Bucket
   */
  public readonly function: Function;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountS3BucketManagerProps,
  ) {
    super(scope, id);

    const {
      bucketName,
      bucketAwsId,
      managerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
      callerTimeout = 30, // default timeout of 3 seconds is awful short/fragile
    } = props;

    const xaMgmtRoleArn = `arn:aws:iam::${bucketAwsId}:role/${bucketName}-xa-mgmt`;
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
      description: `Execution role for ${bucketName} manager Lambda function.`,
      inlinePolicies: {
        assumeXaMgmtRole,
      },
      roleName: `${bucketName}-xa-mgmt-ex`,
    });

    this.function = new Function(this, "xa-mgmt-lambda", {
      code: Code.fromAsset(path.join(__dirname, "lambda-code")),
      handler: "main.handler",
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(managerTimeout),
      environment: {
        XA_MGMT_ROLE_ARN: xaMgmtRoleArn,
        BUCKET_NAME: bucketName,
        ACCESSOR_ACCOUNT_ID: Stack.of(this).account,
        ACCESSOR_STACK_NAME: Stack.of(this).stackName,
      },
      role,
    });

    const cloudfrontDistributionIds =
      CrossAccountS3BucketManager.consumeCloudfrontAccessors(bucketName);
    const cloudfrontAccessors: { [key: string]: string[] } = {};
    for (const id of cloudfrontDistributionIds) {
      const actions =
        CrossAccountS3BucketManager.cloudfrontPermissionsRegistry[id];
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
   * Grant access to the given cross-account S3 bucket to the specified Cloudfront
   * Distribution ID
   * Optionally specify a list of actions (default: ["s3:GetObject"])
   */
  public static allowCloudfront(
    bucketName: string,
    cloudfrontId: string,
    actions?: string[],
  ) {
    if (this.cloudfrontRegistry[bucketName] === false) {
      throw new Error(
        `Cannot register resources for bucket ${bucketName} manager after creation.`,
      );
    }
    actions ??= ["s3:GetObject"];
    this.cloudfrontRegistry[bucketName] ??= new Set<string>();
    this.cloudfrontRegistry[bucketName].add(cloudfrontId);
    this.cloudfrontPermissionsRegistry[cloudfrontId] = new Set(actions);
  }
}
