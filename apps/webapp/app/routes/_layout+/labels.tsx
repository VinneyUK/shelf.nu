/**
 * Labels: print Niimbot labels for assets. Queue and Settings tabs.
 * Part of the labels feature; not in upstream Shelf.
 */
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import HorizontalTabs from "~/components/layout/horizontal-tabs";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { error, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const handle = {
  breadcrumb: () => <Link to="/labels">Labels</Link>,
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });
    return payload({
      header: {
        title: "Labels",
        subHeading:
          "Print QR code labels for your assets on your Niimbot printer.",
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export default function LabelsPage() {
  const { isAdministratorOrOwner } = useUserRoleHelper();
  const items = [
    { to: "queue", content: "Queue" },
    ...(isAdministratorOrOwner
      ? [{ to: "settings", content: "Settings" }]
      : []),
  ];
  return (
    <>
      <Header />
      <HorizontalTabs items={items} />
      <Outlet />
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
