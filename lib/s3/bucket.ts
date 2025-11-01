import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { Bucket, BucketProps } from "aws-cdk-lib/aws-s3";
import {
  AccountRootPrincipal,
  ArnPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";

export interface CrossAccountS3BucketProps extends BucketProps {
  xaAwsIds: string[];
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
export class CrossAccountS3Bucket extends Construct {
  /** The managed S3 bucket */
  public readonly bucket: Bucket;

  /** The IAM role used for cross-account policy management */
  public readonly role: Role;

  constructor(scope: Construct, id: string, props: CrossAccountS3BucketProps) {
    super(scope, id);

    const { xaAwsIds, ...bucketProps } = props;

    this.bucket = new Bucket(this, "xa-bucket", bucketProps);

    this.role = new Role(this, "xa-mgmt-role", {
      assumedBy: new AccountRootPrincipal(), // placeholder
      description: `IAM role to enable cross-account management of policy for ${this.bucket.bucketName}`,
      roleName: `${this.bucket.bucketName}-xa-mgmt`.slice(0, 64),
      inlinePolicies: {
        UpdateBucketPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["s3:GetBucketPolicy", "s3:PutBucketPolicy"],
              resources: [this.bucket.bucketArn],
            }),
          ],
        }),
      },
    });
    for (const xaAwsId of xaAwsIds) {
      const roleName = `${this.bucket.bucketName}-xa-mgmt-execution-role`.slice(
        0,
        64,
      );
      this.role.grantAssumeRole(
        new ArnPrincipal(`arn:aws:iam::${xaAwsId}:role/${roleName}`),
      );
    }

    new CfnOutput(this, "bucket-name", {
      value: this.bucket.bucketName,
      description: "Name of the cross-account managed S3 bucket",
    });

    new CfnOutput(this, "xa-mgmt-role-arn", {
      value: this.role.roleArn,
      description:
        "ARN of the IAM role used for cross-account bucket policy management",
    });
  }
}
