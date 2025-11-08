import { Match } from "aws-cdk-lib/assertions";

export const getRoleNameMatcher = (resourceId: string) =>
  Match.objectEquals({
    "Fn::Join": Match.arrayEquals([
      "",
      Match.arrayEquals([
        Match.objectEquals({
          Ref: Match.stringLikeRegexp(
            `^${resourceId.replaceAll("-", "").replaceAll("_", "")}`,
          ),
        }),
        "-xa-mgmt",
      ]),
    ]),
  });

export const getAwsPrincipalMatcher = (resourceName: string, awsId: string) =>
  Match.objectEquals({
    "Fn::Join": Match.arrayEquals([
      "",
      Match.arrayEquals([
        `arn:aws:iam::${awsId}:role/`,
        Match.objectEquals({
          Ref: Match.stringLikeRegexp(`^${resourceName.replaceAll("-", "")}`),
        }),
        "-xa-mgmt-ex",
      ]),
    ]),
  });

export const getAssumeRolePolicyMatcher = (
  resourceName: string,
  xaAwsIds: string[],
) =>
  Match.objectLike({
    Statement: Match.arrayWith([
      Match.objectLike({
        Action: "sts:AssumeRole",
        Principal: Match.objectLike({
          AWS:
            xaAwsIds.length == 1
              ? getAwsPrincipalMatcher(resourceName, xaAwsIds[0])
              : xaAwsIds.map((id) => getAwsPrincipalMatcher(resourceName, id)),
        }),
      }),
    ]),
    Version: "2012-10-17",
  });
