import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { Bucket, BucketProps } from "aws-cdk-lib/aws-s3";
import {
  CrossAccountConstruct,
  CrossAccountConstructProps,
} from "../cross-account";

export interface CrossAccountS3BucketProps
  extends BucketProps,
    CrossAccountConstructProps {}

/**
 * CrossAccountS3Bucket creates an S3 bucket with a corresponding IAM role
 * that can be assumed by specific cross-account roles to update the bucket policy.
 *
 * @remarks
 * - `xaAwsIds` should be the list of AWS account IDs that are allowed to assume
 *   the management role.
 * - The IAM role created is scoped to `s3:GetBucketPolicy` and `s3:PutBucketPolicy`
 *   on the bucket only.
 */
export class CrossAccountS3Bucket extends CrossAccountConstruct {
  /** The managed S3 bucket */
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: CrossAccountS3BucketProps) {
    const { xaAwsIds, ...bucketProps } = props;
    super(scope, id, { xaAwsIds });

    // The updater Lambda's execution role will have 11 characters appended to it
    // so let's keep the bucket name to 52 characters or less
    if ((bucketProps.bucketName?.length ?? 0) > 52) {
      throw new Error(
        `Bucket name "${bucketProps.bucketName}" must be 52 characters or less.`,
      );
    }

    this.bucket = new Bucket(this, "xaBucket", bucketProps);

    this.createManagementRole(this.bucket.bucketName, this.bucket.bucketArn, [
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
    ]);

    new CfnOutput(this, "xaBucketName", {
      value: this.bucket.bucketName,
      description: "Name of the cross-account managed S3 bucket",
    });
  }
}
