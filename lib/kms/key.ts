import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { Key, KeyProps } from "aws-cdk-lib/aws-kms";
import {
  CrossAccountConstruct,
  CrossAccountConstructProps,
} from "../cross-account";

export interface CrossAccountKmsKeyProps
  extends KeyProps,
    CrossAccountConstructProps {}

/**
 * CrossAccountKmsKey creates a KMS key with a corresponding IAM role
 * that can be assumed by specific cross-account roles to update the resource policy.
 *
 * @remarks
 * - `xaAwsIds` should be the list of AWS account IDs that are allowed to assume
 *   the management role.
 * - The IAM role created is scoped to `kms:GetKeyPolicy` and `kms:PutKeyPolicy`
 *   on this specific key only.
 */
export class CrossAccountKmsKey extends CrossAccountConstruct {
  /** The managed KMS key */
  public readonly key: Key;

  constructor(scope: Construct, id: string, props: CrossAccountKmsKeyProps) {
    const { xaAwsIds, ...keyProps } = props;
    super(scope, id, { xaAwsIds });

    this.key = new Key(this, "xa-key", keyProps);

    this.createManagementRole(this.key.keyId, this.key.keyArn, [
      "kms:GetKeyPolicy",
      "kms:PutKeyPolicy",
    ]);

    new CfnOutput(this, "key-id", {
      value: this.key.keyId,
      description: "ID of the cross-account managed KMS key",
    });
  }
}
