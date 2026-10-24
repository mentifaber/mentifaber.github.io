package org.mentifaber.store;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Download, check, install. An APK is installed only if its SHA-256 matches the catalog, its package is the app the
 *  catalog says it is, and it is signed with the key that signed this Store. Android then refuses an update signed
 *  differently from the copy already on the phone, so the chain holds from the first install on. */
final class Installer {
    interface Listener { void event(JSONObject e); }

    static final String ACTION = "org.mentifaber.store.INSTALL_STATUS";
    private static final long MAX = 400L << 20;
    static volatile Listener listener;
    static final Handler main = new Handler(Looper.getMainLooper());
    static final ExecutorService pool = Executors.newFixedThreadPool(2);
    private static final Set<String> busy = Collections.newSetFromMap(new ConcurrentHashMap<>());

    /** From the storefront: fetch the catalog, then download and install in the background. */
    static void install(Context ctx, String id) {
        Context app = ctx.getApplicationContext();
        if (!busy.add(id)) { emit(event("progress", id).put2("phase", "busy")); return; }
        pool.execute(() -> {
            Catalog.App a = Catalog.find(id);
            if (a == null) finished(app, id, id, false, false, "That app isn't in Foundry's catalog.");
            else run(app, a, false);
        });
    }

    /** From the update check, on its own thread. */
    static void installNow(Context ctx, Catalog.App a) { if (busy.add(a.id)) run(ctx.getApplicationContext(), a, true); }

    static boolean working(String id) { return busy.contains(id); }

    private static void run(Context ctx, Catalog.App a, boolean bg) {
        File f = null;
        try {
            if (version(ctx, a.id) >= a.versionCode) { finished(ctx, a.id, a.name, bg, true, "Up to date"); return; }
            emit(event("progress", a.id).put2("phase", "download").put2("pct", 0));
            f = download(ctx, a);
            emit(event("progress", a.id).put2("phase", "verify"));
            verify(ctx, a, f);
            emit(event("progress", a.id).put2("phase", "install").put2("self", a.id.equals(ctx.getPackageName())));
            commit(ctx, a, f, bg);
        } catch (IOException | RuntimeException e) {
            finished(ctx, a.id, a.name, bg, false, e.getMessage() != null ? e.getMessage() : "The install didn't go through.");
        } finally {
            if (f != null) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
    }

    private static File download(Context ctx, Catalog.App a) throws IOException {
        File dir = new File(ctx.getCacheDir(), "apk");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("There's no room to download it.");
        File f = new File(dir, a.id + ".apk");
        HttpURLConnection c = (HttpURLConnection) new URL(a.apk).openConnection();
        c.setInstanceFollowRedirects(true); c.setConnectTimeout(20000); c.setReadTimeout(30000);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("The download answered " + code + ". Try again in a minute.");
            if (!"https".equals(c.getURL().getProtocol())) throw new IOException("The download wasn't secure, so it was stopped.");
            long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : a.size;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long got = 0; int last = -1, n; byte[] buf = new byte[64 * 1024];
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); md.update(buf, 0, n); got += n;
                    if (got > MAX) throw new IOException("The download is far bigger than the catalog says.");
                    int pct = total > 0 ? (int) Math.min(99, got * 100 / total) : 0;
                    if (pct >= last + 3) { last = pct; emit(event("progress", a.id).put2("phase", "download").put2("pct", pct)); }
                }
            }
            if (!hex(md.digest()).equals(a.sha256)) throw new IOException("The download didn't match the catalog's checksum, so it wasn't installed.");
            return f;
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("This phone can't check downloads.", e);
        } finally { c.disconnect(); }
    }

    private static void verify(Context ctx, Catalog.App a, File f) throws IOException {
        PackageManager pm = ctx.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo apk = pm.getPackageArchiveInfo(f.getPath(), flags);
        if (apk == null) throw new IOException("That download isn't an Android app.");
        if (!a.id.equals(apk.packageName)) throw new IOException("The download is a different app (" + apk.packageName + "), so it wasn't installed.");
        if (code(apk) < a.versionCode) throw new IOException("The download is older than the catalog says.");
        Set<String> theirs = certs(apk), ours;
        try { ours = certs(pm.getPackageInfo(ctx.getPackageName(), flags)); } catch (PackageManager.NameNotFoundException e) { throw new IOException(e); }
        if (theirs.isEmpty() || Collections.disjoint(theirs, ours)) throw new IOException("It isn't signed with Mentifaber's key, so it wasn't installed.");
    }

    private static void commit(Context ctx, Catalog.App a, File f, boolean bg) throws IOException {
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(a.id);
        p.setSize(f.length());
        if (Build.VERSION.SDK_INT >= 26) p.setInstallReason(PackageManager.INSTALL_REASON_USER);
        if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        if (Build.VERSION.SDK_INT >= 33) p.setPackageSource(PackageInstaller.PACKAGE_SOURCE_STORE);
        int sid = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(sid)) {
            try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("base.apk", 0, f.length())) {
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            }
            Intent i = new Intent(ctx, InstallReceiver.class).setAction(ACTION)
                    .putExtra("id", a.id).putExtra("name", a.name).putExtra("version", a.versionName).putExtra("bg", bg);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(ctx, sid, i, fl).getIntentSender());
        } catch (IOException | RuntimeException e) {
            try { pi.abandonSession(sid); } catch (RuntimeException ignored) { }
            throw e;
        }
    }

    /** The system's answer on an install (from InstallReceiver), or a failure before it got that far. */
    static void finished(Context ctx, String id, String name, boolean bg, boolean ok, String msg) {
        busy.remove(id);
        emit(event("done", id).put2("ok", ok).put2("msg", msg));
        if (bg && !ok) Notify.failed(ctx, id, name, msg);
    }

    static void waiting(String id) { emit(event("progress", id).put2("phase", "confirm")); }

    /** Installed apps the catalog has a newer build of. */
    static List<Catalog.App> updates(Context ctx, List<Catalog.App> apps) {
        List<Catalog.App> due = new ArrayList<>();
        for (Catalog.App a : apps) { long v = version(ctx, a.id); if (v >= 0 && v < a.versionCode) due.add(a); }
        return due;
    }

    /** Installed versionCode, or -1 when the app isn't installed. */
    static long version(Context ctx, String id) {
        try { return code(ctx.getPackageManager().getPackageInfo(id, 0)); } catch (PackageManager.NameNotFoundException e) { return -1; }
    }

    static boolean canInstall(Context ctx) { return Build.VERSION.SDK_INT < 26 || ctx.getPackageManager().canRequestPackageInstalls(); }

    @SuppressWarnings("deprecation")
    static long code(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }

    @SuppressWarnings("deprecation")
    private static Set<String> certs(PackageInfo p) throws IOException {
        Signature[] sigs = p.signatures;
        if (Build.VERSION.SDK_INT >= 28 && p.signingInfo != null) {
            SigningInfo si = p.signingInfo;
            sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        try {
            for (Signature s : sigs) out.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        } catch (NoSuchAlgorithmException e) { throw new IOException(e); }
        return out;
    }

    static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(Character.forDigit((x >> 4) & 15, 16)).append(Character.forDigit(x & 15, 16));
        return s.toString();
    }

    static Ev event(String type, String id) { return new Ev().put2("type", type).put2("id", id); }

    static void emit(JSONObject e) { main.post(() -> { Listener l = listener; if (l != null) l.event(e); }); }

    /** JSONObject with a put that doesn't throw, for building events in one line. */
    static final class Ev extends JSONObject {
        Ev put2(String k, Object v) { try { put(k, v); } catch (JSONException ignored) { } return this; }
    }
}
