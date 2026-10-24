package org.mentifaber.store;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.concurrent.TimeUnit;

/** The storefront (mentifaber.org/store) in a WebView, with the Store's powers handed to that page alone. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://mentifaber.org";
    static volatile boolean visible;
    private WebView web;
    private Bridge bridge;
    private BroadcastReceiver packages;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xFF08080A);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " MentifaberStore/" + versionName());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (inStore(r.getUrl())) return false;
                openOutside(r.getUrl()); return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) offline();
            }
        });
        bridge = new Bridge(this);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
            WebViewCompat.addWebMessageListener(web, "MentiStore", Collections.singleton(ORIGIN), bridge);
        Installer.listener = bridge::send;

        packages = new BroadcastReceiver() { // installs, updates and removals made anywhere, so the page stays true
            @Override
            public void onReceive(Context c, Intent i) {
                Uri d = i.getData();
                if (d != null) bridge.send(Installer.event("changed", d.getSchemeSpecificPart()));
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED); f.addAction(Intent.ACTION_PACKAGE_REMOVED); f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(packages, f, Context.RECEIVER_EXPORTED); else registerReceiver(packages, f);

        WorkManager.getInstance(this).enqueueUniquePeriodicWork("updates", ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(UpdateWorker.class, 12, TimeUnit.HOURS)
                        .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && Prefs.once(this, "askedNotify"))
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);

        web.loadUrl(start(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        if (i.getData() != null || i.hasExtra("hash")) web.loadUrl(start(i));
    }

    private String start(Intent i) {
        String url = getString(R.string.store_url);
        Uri d = i.getData();
        if (d != null && inStore(d)) url = d.toString();
        String hash = i.getStringExtra("hash");
        if (hash != null && hash.matches("#[\\w./-]{1,80}")) url = url.replaceFirst("#.*$", "") + hash;
        return url;
    }

    static boolean inStore(Uri u) {
        String p = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme()) && "mentifaber.org".equals(u.getHost()) && (p.equals("/store") || p.startsWith("/store/"));
    }

    private void openOutside(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (ActivityNotFoundException ignored) { }
    }

    private void offline() {
        String retry = getString(R.string.store_url);
        web.loadDataWithBaseURL(null, "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;color:#f2ede4;font:16px/1.5 sans-serif;text-align:center;padding:24px'>"
                + "<div><div style='font-size:22px;font-weight:700'>Mentifaber <span style='color:#f0b24a'>Store</span></div><p style='color:#a39a8a'>The Store needs the internet to show the shelf.</p>"
                + "<a href='" + retry + "' style='display:inline-block;padding:12px 22px;border-radius:999px;background:#f0b24a;color:#1a1200;font-weight:700;text-decoration:none'>Try again</a></div>",
                "text/html", "utf-8", null);
    }

    // ---- what the page can ask for (through Bridge) ----

    JSONObject info() {
        Installer.Ev o = new Installer.Ev().put2("version", versionName()).put2("versionCode", Installer.version(this, getPackageName()))
                .put2("package", getPackageName()).put2("sdk", Build.VERSION.SDK_INT).put2("canInstall", Installer.canInstall(this))
                .put2("silent", Build.VERSION.SDK_INT >= 31).put2("auto", Prefs.auto(this))
                .put2("notify", Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        return o;
    }

    JSONObject installed(JSONArray ids) {
        Installer.Ev out = new Installer.Ev();
        if (ids == null) return out;
        PackageManager pm = getPackageManager();
        for (int i = 0; i < ids.length() && i < 200; i++) {
            String id = ids.optString(i);
            if (!id.matches("[A-Za-z][\\w]*(\\.[A-Za-z][\\w]*)+")) continue;
            try {
                PackageInfo p = pm.getPackageInfo(id, 0);
                out.put2(id, new Installer.Ev().put2("versionCode", Installer.code(p)).put2("versionName", p.versionName).put2("working", Installer.working(id)));
            } catch (PackageManager.NameNotFoundException e) {
                out.put2(id, Installer.working(id) ? new Installer.Ev().put2("versionCode", -1).put2("working", true) : JSONObject.NULL);
            }
        }
        return out;
    }

    /** Installs need "install unknown apps" for the Store, once; this sends the person to that switch. */
    boolean install(String id) {
        if (!Installer.canInstall(this)) { askInstallPermission(); bridge.send(Installer.event("permission", id)); return false; }
        Installer.install(this, id);
        return true;
    }

    void askInstallPermission() {
        if (Build.VERSION.SDK_INT >= 26)
            try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (ActivityNotFoundException ignored) { }
    }

    void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        else if (Build.VERSION.SDK_INT >= 26)
            try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); } catch (ActivityNotFoundException ignored) { }
    }

    /** Open or remove an app: only the ones on the Store's shelf. */
    void withApp(String id, boolean remove) {
        Installer.pool.execute(() -> {
            Catalog.App a = Catalog.find(id);
            if (a == null) return;
            runOnUiThread(() -> {
                try {
                    if (remove) startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + a.id)));
                    else { Intent l = getPackageManager().getLaunchIntentForPackage(a.id); if (l != null) startActivity(l); }
                } catch (ActivityNotFoundException ignored) { }
            });
        });
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (PackageManager.NameNotFoundException e) { return "?"; }
    }

    @Override
    protected void onResume() { super.onResume(); visible = true; if (bridge != null) bridge.send(Installer.event("resume", getPackageName())); }

    @Override
    protected void onPause() { super.onPause(); visible = false; }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    @Override
    protected void onDestroy() {
        if (packages != null) unregisterReceiver(packages);
        Installer.listener = null;
        web.destroy();
        super.onDestroy();
    }
}
