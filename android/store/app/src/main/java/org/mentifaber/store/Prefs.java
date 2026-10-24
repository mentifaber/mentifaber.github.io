package org.mentifaber.store;

import android.content.Context;
import android.content.SharedPreferences;

/** Foundry's few settings. */
final class Prefs {
    private static SharedPreferences p(Context c) { return c.getSharedPreferences("store", Context.MODE_PRIVATE); }
    /** Install updates in the background when Android allows it (on by default). */
    static boolean auto(Context c) { return p(c).getBoolean("auto", true); }
    static void auto(Context c, boolean on) { p(c).edit().putBoolean("auto", on).apply(); }
    static boolean once(Context c, String key) { if (p(c).getBoolean(key, false)) return false; p(c).edit().putBoolean(key, true).apply(); return true; }
}
