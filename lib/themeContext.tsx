// lib/themeContext.tsx
// مزوّد الثيم: يحفظ اختيار المستخدم ويتيحه لكل الشاشات (خلفية + لون مميّز).
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { DEFAULT_THEME_ID, themeById, type AppTheme } from "../constants/themes";

const KEY = "settings:theme_id";

type Ctx = {
  theme: AppTheme;
  themeId: string;
  setThemeId: (id: string) => void;
};

const ThemeCtx = createContext<Ctx>({
  theme: themeById(DEFAULT_THEME_ID),
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setId] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) setId(saved);
    })();
  }, []);

  const setThemeId = (id: string) => {
    setId(id);
    AsyncStorage.setItem(KEY, id).catch(() => {});
  };

  return (
    <ThemeCtx.Provider value={{ theme: themeById(themeId), themeId, setThemeId }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme(): Ctx {
  return useContext(ThemeCtx);
}
