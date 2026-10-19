// components/brand/error-boundary.tsx
// حاجز الأخطاء: خطأ عرض في أي شاشة لا يُغلق التطبيق؛ تظهر رسالة هادئة مع «رجوع» و«إعادة المحاولة»،
// ويُسجَّل الخطأ على السيرفر لإصلاحه.
import { Ionicons } from "@expo/vector-icons";
import { router, type ErrorBoundaryProps } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getCurrentLang } from "../../lib/i18n";
import { dict } from "../../lib/i18n/strings";
import { logAppError } from "../../lib/errorLog";

const tr = (k: string) => dict[getCurrentLang()]?.[k] ?? dict.ar[k] ?? k;

type Props = { children: React.ReactNode; where: string; onBack?: () => void; compact?: boolean };

export class ErrorBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const e = new Error(error.message);
    e.stack = `${error.stack ?? ""}\n--component--${info.componentStack ?? ""}`;
    void logAppError(e, this.props.where, false);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.compact) return null;
    return (
      <View style={styles.wrap}>
        <Ionicons name="refresh-circle-outline" size={46} color="#7C9CFF" />
        <Text style={styles.title}>{tr("errorBoundary.title")}</Text>
        <Text style={styles.body}>{tr("errorBoundary.body")}</Text>
        <View style={styles.row}>
          {this.props.onBack ? (
            <Pressable onPress={this.props.onBack} style={[styles.btn, styles.ghost]}>
              <Text style={styles.ghostTxt}>{tr("common.back")}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => this.setState({ failed: false })} style={styles.btn}>
            <Text style={styles.btnTxt}>{tr("errorBoundary.retry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

/** حاجز الشاشات (expo-router): يُصدَّر من التخطيطات فيحمي كل الشاشات تحته */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void logAppError(error, "route", false);
  }, [error]);
  return (
    <View style={styles.wrap}>
      <Ionicons name="refresh-circle-outline" size={46} color="#7C9CFF" />
      <Text style={styles.title}>{tr("errorBoundary.title")}</Text>
      <Text style={styles.body}>{tr("errorBoundary.body")}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={[styles.btn, styles.ghost]}>
          <Text style={styles.ghostTxt}>{tr("common.back")}</Text>
        </Pressable>
        <Pressable onPress={() => void retry()} style={styles.btn}>
          <Text style={styles.btnTxt}>{tr("errorBoundary.retry")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12, backgroundColor: "#0E1224" },
  title: { color: "#F3F4F8", fontSize: 19, fontWeight: "800", textAlign: "center" },
  body: { color: "#9AA3B8", fontSize: 14.5, lineHeight: 22, textAlign: "center" },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: { backgroundColor: "#7C9CFF", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  btnTxt: { color: "#0E1224", fontWeight: "800", fontSize: 15 },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#3A4360" },
  ghostTxt: { color: "#F3F4F8", fontWeight: "700", fontSize: 15 },
});
