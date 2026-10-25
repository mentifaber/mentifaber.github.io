package org.mentifaber.roku;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/** The remote (mentifaber.org/roku-app) in a WebView, with a line to the TVs on this Wi-Fi handed to that page alone. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://mentifaber.org";
    private WebView web;
    private Bridge bridge;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0A0914);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " Eightysixty/" + versionName());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (inRemote(r.getUrl())) return false;
                openOutside(r.getUrl()); return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) offline();
            }
        });
        bridge = new Bridge(this);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
            WebViewCompat.addWebMessageListener(web, "RokuBridge", Collections.singleton(ORIGIN), bridge);
        web.loadUrl(getString(R.string.remote_url));
    }

    static boolean inRemote(Uri u) {
        String p = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme()) && "mentifaber.org".equals(u.getHost()) && (p.equals("/roku-app") || p.equals("/roku-app.html"));
    }

    private void openOutside(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (ActivityNotFoundException ignored) { }
    }

    private void offline() {
        String retry = getString(R.string.remote_url);
        web.loadDataWithBaseURL(null, "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0914;color:#ece8ff;font:16px/1.5 sans-serif;text-align:center;padding:24px'>"
                + "<div><div style='font-size:22px;font-weight:700;color:#a38dfb'>Eightysixty</div><p style='color:#9d97b8'>Eightysixty loads its remote from mentifaber.org once, then talks to your TV over Wi-Fi.<br>Connect to the internet and try again.</p>"
                + "<a href='" + retry + "' style='display:inline-block;padding:12px 22px;border-radius:999px;background:#a38dfb;color:#140f2a;font-weight:700;text-decoration:none'>Try again</a></div>",
                "text/html", "utf-8", null);
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    @Override
    protected void onDestroy() { if (bridge != null) bridge.close(); super.onDestroy(); }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
