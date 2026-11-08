import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@esmart/ui/theme/ThemeProvider";
import { Button } from "@esmart/ui/components/Button";
import { Card } from "@esmart/ui/components/Card";
import { EmptyState } from "@esmart/ui/components/EmptyState";
import { TextField } from "@esmart/ui/components/Field";
import { Sheet } from "@esmart/ui/components/Sheet";
import { Text } from "@esmart/ui/components/Text";
import { ListRow } from "@esmart/ui/components/ListRow";
import { useToast } from "@esmart/ui/components/Toast";
import { SHOW_SCROLLBAR } from "@esmart/ui/theme/breakpoints";
import { documentKindLabel } from "@esmart/core/labels";
import { formatMoney } from "@esmart/core/lib/format";
import type { BusinessDocument } from "@esmart/core/types";
import { api } from "../../../remote/api";
import { describeError } from "../../../remote/errors";
import { refreshSoon } from "../../../remote/refresh";
import { useAppStore } from "../../../store/appStore";
import { useCurrentUser } from "../../../store/selectors";
import { useApprovalActions } from "../../../features/approvals/ApprovalBanner";
import { detailRouteFor } from "../../../features/documents/DocumentEditor";

/** What waits for an owner or admin: documents and payments over an approval rule's amount, oldest first. */
export default function ApprovalsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(["sales", "common"]);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const role = useCurrentUser()?.role ?? "";
  const { approve } = useApprovalActions();
  const pending = useQuery({
    queryKey: ["approvals", companyId],
    enabled: !!companyId,
    queryFn: async () =>
      ((
        await api.GET("/companies/{companyId}/approvals", {
          params: { path: { companyId } },
        })
      ).data?.data ?? []) as unknown as BusinessDocument[],
  });
  const docs = pending.data ?? [];
  const canDecide = role === "owner" || role === "admin";
  const queryClient = useQueryClient();
  // Payments over the payment rule (RULES 6.14): recorded only when approved.
  const requests = useQuery({
    queryKey: ["paymentRequests", companyId],
    enabled: !!companyId,
    queryFn: async () =>
      (
        await api.GET("/companies/{companyId}/payment-requests", {
          params: { path: { companyId } },
        })
      ).data?.data ?? [],
  });
  const held = requests.data ?? [];
  const [declining, setDeclining] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (id: string, verdict: "approve" | "reject") => {
    setBusy(true);
    try {
      const res =
        verdict === "approve"
          ? await api.POST(
              "/companies/{companyId}/payment-requests/{id}/approve",
              { params: { path: { companyId, id } } },
            )
          : await api.POST(
              "/companies/{companyId}/payment-requests/{id}/reject",
              {
                params: { path: { companyId, id } },
                body: { note: why.trim() },
              },
            );
      if (res.error) throw res.error;
      toast.show(
        tr(
          verdict === "approve"
            ? "sales:approval.paymentApproved"
            : "sales:approval.paymentRejected",
        ),
        "success",
        {
          icon: verdict === "approve" ? "check" : "close",
          detail: res.data?.payment.number || undefined,
        },
      );
      setDeclining(null);
      setWhy("");
      refreshSoon();
      await queryClient.invalidateQueries({
        queryKey: ["paymentRequests", companyId],
      });
    } catch (err) {
      toast.show(describeError(err, tr), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr("sales:approval.title") }} />
      {pending.isLoading || requests.isLoading ? (
        <ActivityIndicator
          color={t.c.muted}
          style={{ padding: t.spacing.xl }}
        />
      ) : docs.length || held.length ? (
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          {held.length ? (
            <>
              <Text variant="caption" tone="muted" weight="600">
                {tr("sales:approval.payments")}
              </Text>
              <Card padded={false}>
                {held.map((r, i) => (
                  <ListRow
                    key={r.id}
                    title={`${formatMoney(r.amount)}${r.payment.reference ? ` · ${r.payment.reference}` : ""}`}
                    subtitle={tr("sales:approval.paymentBy", {
                      party: r.partyName,
                      name: r.requestedByName ?? "",
                    })}
                    right={
                      canDecide ? (
                        <View
                          style={{ flexDirection: "row", gap: t.spacing.sm }}
                        >
                          <Button
                            title={tr("sales:approval.reject")}
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onPress={() => setDeclining(r.id)}
                          />
                          <Button
                            title={tr("sales:approval.approve")}
                            size="sm"
                            disabled={busy}
                            onPress={() => void decide(r.id, "approve")}
                          />
                        </View>
                      ) : undefined
                    }
                    divider={i < held.length - 1}
                  />
                ))}
              </Card>
            </>
          ) : null}
          {docs.length && held.length ? (
            <Text variant="caption" tone="muted" weight="600">
              {tr("sales:approval.documents")}
            </Text>
          ) : null}
          {docs.length ? (
            <Card padded={false}>
              {docs.map((d, i) => (
                <ListRow
                  key={d.id}
                  title={`${documentKindLabel(tr, d.kind, 1)} · ${formatMoney(d.totals.grandTotal)}`}
                  subtitle={d.number}
                  right={
                    canDecide ? (
                      <Button
                        title={tr("sales:approval.approve")}
                        size="sm"
                        onPress={() =>
                          void approve(d.id)
                            .then(() =>
                              toast.show(
                                tr("sales:approval.approved"),
                                "success",
                                { icon: "check", detail: d.number },
                              ),
                            )
                            .catch((err) =>
                              toast.show(describeError(err, tr), "error"),
                            )
                        }
                      />
                    ) : undefined
                  }
                  chevron
                  divider={i < docs.length - 1}
                  onPress={() =>
                    router.push(detailRouteFor(d.kind, d.id) as never)
                  }
                />
              ))}
            </Card>
          ) : null}
        </ScrollView>
      ) : (
        <EmptyState
          icon="check-decagram-outline"
          title={tr("sales:approval.empty")}
          message={tr("sales:approval.emptyBody")}
        />
      )}
      <Sheet
        visible={declining !== null}
        onClose={() => setDeclining(null)}
        title={tr("sales:approval.reject")}
      >
        <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.lg }}>
          <TextField
            label={tr("sales:approval.why")}
            value={why}
            onChangeText={setWhy}
            maxLength={500}
            multiline
          />
          <Button
            title={tr("sales:approval.reject")}
            disabled={!why.trim() || busy}
            loading={busy}
            onPress={() => declining && void decide(declining, "reject")}
          />
        </View>
      </Sheet>
    </View>
  );
}
