import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import {
  AccountRootPrincipal,
  ArnPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";

/**
 * Properties for CrossAccountConstruct.
 */
export interface CrossAccountConstructProps {
  /**
   * List of AWS account IDs allowed to assume the management role.
   * Each string should be a 12-digit numeric AWS account ID.
   */
  xaAwsIds: string[];
}

/**
 * Abstract base class for cross-account resource management.
 *
 * @remarks
 * Provides a standard way to create an IAM management role that can be
 * assumed by specified accounts to manage resource policies (e.g., S3 bucket policies, KMS key policies).
 *
 * Subclasses should call `createManagementRole()` in their constructor or initialization
 * to set up the IAM role and grant cross-account assume-role permissions.
 */
export abstract class CrossAccountConstruct extends Construct {
  /** The IAM role used for cross-account policy management */
  private mgmtRole: Role;

  /** Getter for the cross-account management role */
  public get role(): Role {
    return this.mgmtRole;
  }

  private readonly xaAwsIds: string[];

  /**
   * Creates the IAM role used to manage policies on the target resource.
   *
   * @param resourceIdentifier - A human-readable identifier for the resource (used in the role name and description).
   * @param policyTarget - The resource target in the policy for this role (usually an ARN).
   * @param policyActions - List of actions the role can perform on the resource (e.g., ["s3:GetBucketPolicy", "s3:PutBucketPolicy"]).
   */
  protected createManagementRole(
    resourceIdentifier: string,
    policyTarget: string,
    policyActions: string[],
  ) {
    this.mgmtRole = new Role(this, "XaMgmtRole", {
      assumedBy: new AccountRootPrincipal(), // placeholder
      description: `IAM role to enable cross-account management of policy for ${resourceIdentifier}`,
      roleName: `${resourceIdentifier}-xa-mgmt`,
      inlinePolicies: {
        UpdateResourcePolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: policyActions,
              resources: [policyTarget],
            }),
          ],
        }),
      },
    });
    const accessorRoleName = `${resourceIdentifier}-xa-mgmt-ex`;

    this.role.assumeRolePolicy?.addStatements(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: this.xaAwsIds.map(
          (id) =>
            new ArnPrincipal(`arn:aws:iam::${id}:role/${accessorRoleName}`),
        ),
        actions: ["sts:AssumeRole"],
      }),
    );

    new CfnOutput(this, "XaMgmtRoleArn", {
      value: this.role.roleArn,
      description:
        "ARN of the IAM role used for cross-account resource policy management",
    });
  }

  /**
   * Constructs a CrossAccountConstruct.
   *
   * @param scope - The parent Construct scope.
   * @param id - Logical ID of the construct.
   * @param props - Properties including the cross-account AWS IDs.
   */
  constructor(scope: Construct, id: string, props: CrossAccountConstructProps) {
    super(scope, id);

    const { xaAwsIds } = props;

    this.xaAwsIds = xaAwsIds;
  }
}
