// components/brand/mind-tree.tsx
// تفرّعات الخريطة الذهنية (قرار نهلة ٢٥ أكتوبر): تحت الخريطة الشعاعية، كل فرع بطاقة بلونه وجملة ربطه 🔗،
// والضغط يفتح شجرته: نقطة ← تفرّع ← تفصيل بخطوط توصيل، وكل نقطة لها فروع عليها ＋ تُفتح وتُطوى بلمسة —
// فيتضح ما يتفرع من ماذا دون ازدحام. الخريطة القديمة (نقاط بلا تفرّع) تظهر كما كانت.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDir } from "../../lib/i18n";
import { useScene } from "../../lib/scene";
import type { MindMap, MindNode } from "../../lib/syllabus";
import { MM_COLORS } from "./mindmap";

function Node({ n, color, depth, open0 }: { n: MindNode; color: string; depth: number; open0: boolean }) {
  const dir = useDir();
  const { pal } = useScene();
  const [open, setOpen] = useState(open0);
  const has = !!n.sub?.length;
  const side = dir.isRTL ? { borderRightWidth: 2, borderRightColor: color + "66", marginRight: 9, paddingRight: 10 } : { borderLeftWidth: 2, borderLeftColor: color + "66", marginLeft: 9, paddingLeft: 10 };
  return (
    <View>
      <Pressable disabled={!has} onPress={() => setOpen((v) => !v)} style={({ pressed }) => [styles.nodeRow, { flexDirection: dir.row, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.dot, { width: 10 - depth * 2, height: 10 - depth * 2, backgroundColor: depth === 1 ? color : "transparent", borderColor: color }]} />
        <Text style={[styles.nodeTxt, { color: pal.ink, fontSize: 15.5 - depth, fontWeight: depth === 1 ? "800" : "600", textAlign: dir.textAlign }]}>{n.t}</Text>
        {has ? (
          <View style={[styles.plus, { borderColor: color, backgroundColor: open ? color : "transparent" }]}>
            <Ionicons name={open ? "remove" : "add"} size={13} color={open ? "#fff" : color} />
          </View>
        ) : null}
      </Pressable>
      {has && open ? (
        <View style={[styles.children, side]}>
          {n.sub!.map((c, i) => (
            <Node key={i} n={c} color={color} depth={depth + 1} open0={false} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function MindTree({ map }: { map: MindMap }) {
  const dir = useDir();
  const { pal } = useScene();
  const [openB, setOpenB] = useState<number | null>(0);
  return (
    <View style={{ gap: 10 }}>
      {map.branches.map((b, bi) => {
        const c = MM_COLORS[bi % MM_COLORS.length];
        const nodes: MindNode[] = b.tree?.length ? b.tree : b.points.map((t) => ({ t }));
        const open = openB === bi;
        return (
          <View key={bi} style={[styles.branch, { borderColor: c + "66", backgroundColor: pal.card }]}>
            <Pressable onPress={() => setOpenB(open ? null : bi)} style={[styles.head, { backgroundColor: c + "22", flexDirection: dir.row }]}>
              <View style={[styles.bdot, { backgroundColor: c }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.label, { color: pal.ink, textAlign: dir.textAlign }]}>{b.label}</Text>
                {b.hook ? <Text style={[styles.hook, { color: pal.dim, textAlign: dir.textAlign }]}>🔗 {b.hook}</Text> : null}
              </View>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c} />
            </Pressable>
            {open ? (
              <View style={styles.body}>
                {nodes.map((n, i) => (
                  <Node key={i} n={n} color={c} depth={1} open0={nodes.length <= 3} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** نسخة الطباعة: صفحة لكل فرع بشجرته كاملة مفتوحة (ألوان مُصمتة) */
export function mindTreePrintHtml(map: MindMap): string {
  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const mix = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * a + 255 * (1 - a)));
    return `rgb(${c.join(",")})`;
  };
  const nodeHtml = (n: MindNode, c: string, d: number): string =>
    `<li class="d${d}"><span class="t" style="${d === 1 ? `color:${c}` : ""}">${esc(n.t)}</span>${
      n.sub?.length ? `<ul style="border-color:${mix(c, 0.45)}">${n.sub.map((x) => nodeHtml(x, c, d + 1)).join("")}</ul>` : ""
    }</li>`;
  return map.branches
    .filter((b) => b.tree?.length)
    .map((b) => {
      const c = MM_COLORS[map.branches.indexOf(b) % MM_COLORS.length];
      return `<div class="tb"><div class="tbh" style="background:${mix(c, 0.12)};border-color:${c};color:${c}"><span class="cx">${esc(map.center)}</span> ← ${esc(b.label)}</div>${
        b.hook ? `<div class="tbk">🔗 ${esc(b.hook)}</div>` : ""
      }<ul class="root" style="border-color:${mix(c, 0.45)}">${b.tree!.map((n) => nodeHtml(n, c, 1)).join("")}</ul></div>`;
    })
    .join("");
}

export const MIND_TREE_CSS = `
  .tb { page-break-before: always; break-inside: avoid; }
  .tbh { font-size: 19px; font-weight: 800; border-right: 6px solid; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; }
  .tbh .cx { color: #5b6372; font-weight: 600; font-size: 14px; }
  .tbk { font-size: 13.5px; color: #39404d; background: #FFF7D6; border-radius: 8px; padding: 5px 10px; margin-bottom: 10px; display: inline-block; }
  .tb ul { list-style: none; margin: 0; padding: 0 18px 0 0; border-right: 2px solid; }
  .tb ul.root { border-right: none; padding-right: 0; columns: 2; column-gap: 26px; }
  .tb li { position: relative; padding: 3px 0; break-inside: avoid; }
  .tb li.d1 { margin-bottom: 8px; }
  .tb li .t { font-size: 13.5px; line-height: 1.7; }
  .tb li.d1 > .t { font-size: 15px; font-weight: 800; }
  .tb li.d2 > .t { font-weight: 700; }
  .tb li.d2 > .t::before, .tb li.d3 > .t::before, .tb li.d4 > .t::before { content: "— "; color: #9aa3b2; }
`;

const styles = StyleSheet.create({
  branch: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  head: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  bdot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 16, fontWeight: "900" },
  hook: { fontSize: 13, lineHeight: 19 },
  body: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  nodeRow: { alignItems: "center", gap: 8, paddingVertical: 5 },
  dot: { borderRadius: 6, borderWidth: 2 },
  nodeTxt: { flex: 1, lineHeight: 23 },
  plus: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  children: { gap: 0, marginVertical: 2 },
});
