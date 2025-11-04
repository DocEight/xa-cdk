import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CrossAccountManager } from "../cross-account";

export interface CrossAccountS3BucketManagerProps {
  xaBucketName: string;
  xaAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
}

/**
 * CrossAccountS3BucketManager creates a Lambda function and calls it at deployment
 * time using an AwsCustomResource (Lambda:InvokeFunction).
 *
 * @remarks
 * - `xaBucketName` should be the name of the S3 bucket in the other account whose
 *   policy we want to manage.
 * - `xaAwsId` should be the ID of the AWS account the aforementioned bucket
 *   belongs to.
 * - `managerTimeout` is optional and specifies the number of seconds for the manager
 *   Lambda Function's timeout (defaults to 30).
 * - `callerTimeout` is optional and specifies the number of seconds for the
 *   AwsCustomResource's timeout (defaults to 30).
 * - To use this construct, first register the resources that need to access a given
 *   S3 Bucket using one of the following static registry functions:
 *   - allowCloudfront(bucketName, cloudfrontId)
 */
export class CrossAccountS3BucketManager extends CrossAccountManager {
  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountS3BucketManagerProps,
  ) {
    const { xaBucketName, xaAwsId, managerTimeout, callerTimeout } = props;
    super(scope, id, {
      resourceIdentifier: xaBucketName,
      xaAwsId,
      managerTimeout,
      callerTimeout,
    });
  }

  /**
   * Grant access to the given cross-account S3 bucket to the specified Cloudfront
   * Distribution ID
   * Optionally specify a list of actions (default: ["s3:GetObject"])
   */
  public static allowCloudfront(
    context: Construct,
    bucketName: string,
    cloudfrontId: string,
    actions?: string[],
  ) {
    const stack = Stack.of(context);
    const caller = this;
    actions ??= ["s3:GetObject"];
    super.registerCloudfrontAccessor(
      stack,
      caller,
      bucketName,
      cloudfrontId,
      actions,
    );
  }
}
