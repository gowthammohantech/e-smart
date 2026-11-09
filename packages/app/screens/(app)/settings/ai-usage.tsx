import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@esmart/ui/theme/ThemeProvider";
import { Button } from "@esmart/ui/components/Button";
import { Card } from "@esmart/ui/components/Card";
import { SwitchField, TextField } from "@esmart/ui/components/Field";
import { Text } from "@esmart/ui/components/Text";
import { FormActions } from "@esmart/ui/components/ActionBar";
import { LixiAccessCard } from "../../../features/company/LixiAccessCard";
import { LoadFailed } from "../../../features/company/LoadFailed";
import { useSaveShortcut } from "../../../components/useSaveShortcut";
import { SHOW_SCROLLBAR, WIDE_FORM_MAX_WIDTH, useFieldWidth, useIsDesktop } from "@esmart/ui/theme/breakpoints";
import { useServerSave } from "../../../components/useServerSave";
import { useAiUsage } from "../../../remote/queries";
import { useAppStore } from "../../../store/appStore";
import { useActiveCompany, useCurrentUser } from "../../../store/selectors";
import { SkeletonGroup, SkeletonText } from "@esmart/ui/components/Skeleton";

/**
 * AI actions this month (Lixi messages and bills read by the scanning service) against the
 * allowance, and the owner's own monthly budget below the plan's. Past it, Lixi and scanning pause
 * until the 1st.
 */
export default function AiUsageScreen() {
  // Keyed by business: on the web the page stays open across a switch, and what it copied or fetched
  // at mount belongs to the business it opened on.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <AiUsageScreenBody key={companyId} />;
}

function AiUsageScreenBody() {
  const t = useTheme();
  const { t: tr } = useTranslation(["settings"]);
  const company = useActiveCompany();
  const owner = useCurrentUser()?.role === "owner";
  const saveCompany = useAppStore((s) => s.saveCompany);
  const { run: serverSave, saving } = useServerSave();
  const usage = useAiUsage();
  const [capped, setCapped] = useState(
    company.aiMonthlyLimit !== null && company.aiMonthlyLimit !== undefined,
  );
  const [budget, setBudget] = useState(
    company.aiMonthlyLimit != null ? String(company.aiMonthlyLimit) : "",
  );
  const u = usage.data;
  const share = u && u.limit ? Math.min(1, u.total / u.limit) : 0;
  const budgetValue = capped ? Number.parseInt(budget, 10) : null;
  const badBudget =
    capped && (!Number.isFinite(budgetValue) || (budgetValue ?? 0) < 0);
  const desktop = useIsDesktop();
  const fw = useFieldWidth();
  const save = () =>
    serverSave(
      () => saveCompany({ ...company, aiMonthlyLimit: budgetValue }),
      tr("settings:aiUsage.saved"),
      { icon: "robot-outline" },
    ).then(() => usage.refetch());
  useSaveShortcut(() => void save(), owner && !badBudget && !saving);

  return (
    // Left-aligned like the other settings pages; a wide form's width on a desktop.
    <KeyboardAvoidingView
      style={desktop ? { flex: 1, width: "100%", maxWidth: WIDE_FORM_MAX_WIDTH } : { flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: tr("settings:aiUsage.title") }} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <Text variant="small" tone="muted">
          {tr("settings:aiUsage.hint")}
        </Text>
        <Card style={{ gap: t.spacing.md }}>
          {u ? (
            <>
              <Text variant="body" weight="600">
                {tr("settings:aiUsage.used", { used: u.total, limit: u.limit })}
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: u.limit, now: u.total }}
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: t.c.line,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${share * 100}%`,
                    height: "100%",
                    backgroundColor:
                      share >= 1
                        ? t.c.bad
                        : share >= 0.8
                          ? t.c.warn
                          : t.c.primary,
                  }}
                />
              </View>
              <Text variant="caption" tone="muted">
                {tr("settings:aiUsage.breakdown", {
                  lixi: u.used.lixi,
                  ocr: u.used.ocr,
                })}
              </Text>
              <Text variant="caption" tone="muted">
                {tr("settings:aiUsage.plan", { limit: u.planLimit })}
              </Text>
              {share >= 1 ? (
                <Text variant="caption" tone="bad">
                  {tr("settings:aiUsage.reached")}
                </Text>
              ) : null}
            </>
          ) : usage.isError ? (
            <LoadFailed onRetry={usage.refetch} compact />
          ) : (
            <SkeletonGroup>
              <SkeletonText lines={3} />
            </SkeletonGroup>
          )}
        </Card>
        <Card style={{ gap: t.spacing.md }}>
          <SwitchField
            label={tr("settings:aiUsage.budget")}
            description={tr(
              owner
                ? "settings:aiUsage.budgetHint"
                : "settings:aiUsage.ownerOnly",
            )}
            value={capped}
            onValueChange={setCapped}
            disabled={!owner}
          />
          {capped ? (
            <TextField
              label={tr("settings:aiUsage.budgetLabel")}
              value={budget}
              onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              editable={owner}
              error={
                badBudget ? tr("settings:aiUsage.budgetInvalid") : undefined
              }
              containerStyle={fw("sm")}
            />
          ) : null}
        </Card>
        {/* How Lixi opens on this device: switches that save as they flip. */}
        <LixiAccessCard />
      </ScrollView>
      {/* The budget is typed, so it is saved from the bar under the form. */}
      {owner ? (
        <FormActions>
          <Button
            shortcut="S"
            title={tr("settings:aiUsage.save")}
            loading={saving}
            disabled={badBudget || saving}
            onPress={() => void save()}
            fullWidth={!desktop}
          size={desktop ? undefined : 'lg'}
          />
        </FormActions>
      ) : null}
    </KeyboardAvoidingView>
  );
}
