import { Duration } from "aws-cdk-lib";
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
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import path from "path";

interface Registry {
  [bucketName: string]: { [service: string]: Set<string> };
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
  /** Static registry mapping bucketNames to services to resource IDs that need access */
  private static registry: Registry = {};

  /** Returns a sorted list of the set of Cloudfront Distribution IDs in the registry */
  private static getCloudfrontAccessors(bucketName: string): string[] {
    return [...(this.registry[bucketName]?.["cloudfront"] ?? [])].sort();
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
      managerTimeout = 30,
      callerTimeout = 30,
    } = props;

    const assumeXaMgmtRole = new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["sts:AssumeRole"],
          resources: [`arn:aws:iam::${bucketAwsId}:role/${bucketName}-xa-mgmt`],
        }),
      ],
    });

    const role = new Role(this, "xa-mgmt-lambda-role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      description: `Execution role for ${bucketName} Lambda function.`,
      inlinePolicies: {
        AssumeXaMgmtRole: assumeXaMgmtRole,
      },
      roleName: `${bucketName}-xa-mgmt-ex`,
    });

    this.function = new Function(this, "xa-mgmt-lambda", {
      code: Code.fromAsset(path.join(__dirname, "lambda-code")),
      handler: "main.handler",
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(managerTimeout), // default timeout of 3 seconds is awful short/fragile
      role,
    });

    const cloudfrontDistributionIds =
      CrossAccountS3BucketManager.getCloudfrontAccessors(bucketName);

    const callFor = (operation: string) => {
      return {
        service: "Lambda",
        action: "InvokeFunction",
        parameters: {
          FunctionName: this.function.functionName,
          InvocationType: "Event",
          Payload: JSON.stringify({
            operation,
            cloudfrontDistributionIds,
          }),
        },
      };
    };

    const caller = new AwsCustomResource(this, "xa-mgmt-lambda-caller", {
      onCreate: callFor("create"),
      onUpdate: callFor("update"),
      onDelete: callFor("delete"),
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.function.functionArn],
      }),
      timeout: Duration.seconds(callerTimeout),
    });
  }

  public static allowCloudfront(bucketName: string, cloudfrontId: string) {
    if (!(bucketName in this.registry)) {
      this.registry[bucketName] = {};
      this.registry[bucketName]["cloudfront"] = new Set<string>();
    }
    this.registry[bucketName]["cloudfront"].add(cloudfrontId);
  }
}
