import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import {
  CrossAccountConstruct,
  CrossAccountConstructProps,
} from "../cross-account";

export interface CrossAccountKmsKeyProps
  extends kms.KeyProps,
    CrossAccountConstructProps {}

export interface CrossAccountKmsKeyWrapperProps
  extends CrossAccountConstructProps {
  existing: kms.IKey;
}

/**
 * CrossAccountKmsKey creates a KMS key with a corresponding IAM role
 * that can be assumed by specific cross-account resources to update the resource policy.
 *
 * @remarks
 * - `xaAwsIds` should be the list of AWS account IDs that are allowed to assume
 *   the management role.
 * - The IAM role created is scoped to `kms:GetKeyPolicy` and `kms:PutKeyPolicy`
 *   on this specific key only.
 */
export class CrossAccountKmsKey extends CrossAccountConstruct {
  /** The managed KMS key */
  public readonly key: kms.Key;

  constructor(scope: Construct, id: string, props: CrossAccountKmsKeyProps) {
    const { xaAwsIds, ...keyProps } = props;
    super(scope, id, { xaAwsIds });

    this.key = new kms.Key(this, "XaKey", keyProps);

    this.createManagementRole(this.key.keyId, this.key.keyArn, [
      "kms:GetKeyPolicy",
      "kms:PutKeyPolicy",
    ]);

    new CfnOutput(this, "XaKeyArn", {
      value: this.key.keyArn,
      description: "ARN of the cross-account managed KMS key",
    });
  }
}

/**
 * CrossAccountKmsKeyWrapper takes an existing KMS key and creates a corresponding IAM
 * role that can be assumed by specific cross-account resources to update its resource policy.
 *
 * @remarks
 * - `xaAwsIds` should be the list of AWS account IDs that are allowed to assume
 *   the management role.
 * - The IAM role created is scoped to `kms:GetKeyPolicy` and `kms:PutKeyPolicy`
 *   on this specific key only.
 */
export class CrossAccountKmsKeyWrapper extends CrossAccountConstruct {
  /** The managed KMS key */
  public readonly wrappedKey: kms.IKey;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountKmsKeyWrapperProps,
  ) {
    const { xaAwsIds, existing } = props;
    super(scope, id, { xaAwsIds });

    this.wrappedKey = existing;

    this.createManagementRole(this.wrappedKey.keyId, this.wrappedKey.keyArn, [
      "kms:GetKeyPolicy",
      "kms:PutKeyPolicy",
    ]);

    new CfnOutput(this, "XaKeyArn", {
      value: this.wrappedKey.keyArn,
      description: "ARN of the cross-account managed KMS key",
    });
  }
}
