import { Construct } from "constructs";
import { CfnOutput, Token } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import {
  CrossAccountConstruct,
  CrossAccountConstructProps,
} from "../cross-account";

export interface CrossAccountS3BucketProps
  extends s3.BucketProps,
    CrossAccountConstructProps {}

export interface CrossAccountS3BucketWrapperProps
  extends CrossAccountConstructProps {
  existing: s3.IBucket;
}

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
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CrossAccountS3BucketProps) {
    const { xaAwsIds, ...bucketProps } = props;
    super(scope, id, { xaAwsIds });

    // The updater Lambda's execution role will have 11 characters appended to it
    // so let's ensure the bucket name is 52 characters or less
    if ((this.bucket.bucketName.length ?? 0) > 52) {
      throw new Error(
        `Bucket name "${this.bucket.bucketName}" must be 52 characters or less.`,
      );
    }

    this.bucket = new s3.Bucket(this, "XaBucket", bucketProps);

    this.createManagementRole(this.bucket.bucketName, this.bucket.bucketArn, [
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
    ]);

    new CfnOutput(this, "XaBucketName", {
      value: this.bucket.bucketName,
      description: "Name of the cross-account managed S3 bucket",
    });
  }
}

export class CrossAccountS3BucketWrapper extends CrossAccountConstruct {
  /** The managed S3 bucket */
  public readonly wrappedBucket: s3.IBucket;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountS3BucketWrapperProps,
  ) {
    const { xaAwsIds, existing } = props;
    super(scope, id, { xaAwsIds });

    // The updater Lambda's execution role will have 11 characters appended to it
    // so let's try to ensure the bucket name is 52 characters or less
    if (Token.isUnresolved(existing.bucketName)) {
      console.log(
        `WARNING: Cannot length check unresolved bucketName for CrossAccountS3Bucket ${id}.`,
      );
    } else if ((existing.bucketName.length ?? 0) > 52) {
      throw new Error(
        `Bucket name "${existing.bucketName}" must be 52 characters or less.`,
      );
    }

    this.wrappedBucket = existing;

    this.createManagementRole(
      this.wrappedBucket.bucketName,
      this.wrappedBucket.bucketArn,
      ["s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy"],
    );

    new CfnOutput(this, "XaBucketName", {
      value: this.wrappedBucket.bucketName,
      description: "Name of the cross-account managed S3 bucket",
    });
  }
}
