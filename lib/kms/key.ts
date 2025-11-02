import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { Key, KeyProps } from "aws-cdk-lib/aws-kms";
import {
  AccountRootPrincipal,
  ArnPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";

export interface CrossAccountKmsKeyProps extends KeyProps {
  xaAwsIds: string[];
}

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
export class CrossAccountKmsKey extends Construct {
  /** The managed KMS key */
  public readonly key: Key;

  /** The IAM role used for cross-account policy management */
  public readonly role: Role;

  constructor(scope: Construct, id: string, props: CrossAccountKmsKeyProps) {
    super(scope, id);

    const { xaAwsIds, ...keyProps } = props;

    this.key = new Key(this, "xa-key", keyProps);

    this.role = new Role(this, "xa-mgmt-role", {
      assumedBy: new AccountRootPrincipal(), // placeholder
      description: `IAM role to enable cross-account management of policy for ${this.key.keyId}`,
      roleName: `${this.key.keyId}-xa-mgmt`,
      inlinePolicies: {
        UpdateKeyPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["kms:GetKeyPolicy", "kms:PutKeyPolicy"],
              resources: [this.key.keyArn],
            }),
          ],
        }),
      },
    });

    const roleName = `${this.key.keyId}-xa-mgmt-ex`;
    this.role.assumeRolePolicy?.addStatements(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: xaAwsIds.map(
          (id) => new ArnPrincipal(`arn:aws:iam::${id}:role/${roleName}`),
        ),
        actions: ["sts:AssumeRole"],
      }),
    );

    new CfnOutput(this, "key-id", {
      value: this.key.keyId,
      description: "ID of the cross-account managed KMS key",
    });

    new CfnOutput(this, "xa-mgmt-role-arn", {
      value: this.role.roleArn,
      description:
        "ARN of the IAM role used for cross-account key policy management",
    });
  }
}
