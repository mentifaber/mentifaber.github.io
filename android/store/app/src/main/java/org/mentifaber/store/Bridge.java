package org.mentifaber.store;

import android.net.Uri;
import android.webkit.WebView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import org.json.JSONException;
import org.json.JSONObject;

/** The page's line to the Store, as window.MentiStore: given only to https://mentifaber.org, main frame only.
 *  Messages are JSON {op, req, id?}; answers come back as {type:"reply", req, data}, and events (progress, done,
 *  changed, resume, permission) as {type, id, …}. */
final class Bridge implements WebViewCompat.WebMessageListener {
    private final MainActivity act;
    private JavaScriptReplyProxy reply;

    Bridge(MainActivity act) { this.act = act; }

    @Override
    public void onPostMessage(WebView view, WebMessageCompat message, Uri origin, boolean isMainFrame, JavaScriptReplyProxy proxy) {
        if (!isMainFrame || !MainActivity.ORIGIN.equals(origin.toString())) return;
        reply = proxy;
        JSONObject m;
        try { m = new JSONObject(message.getData() == null ? "" : message.getData()); } catch (JSONException e) { return; }
        String op = m.optString("op"), id = m.optString("id");
        Object data = true;
        switch (op) {
            case "hello": data = act.info(); break;
            case "installed": data = act.installed(m.optJSONArray("ids")); break;
            case "install": data = act.install(id); break;
            case "open": act.withApp(id, false); break;
            case "uninstall": act.withApp(id, true); break;
            case "permission": act.askInstallPermission(); break;
            case "notifications": act.askNotifications(); break;
            case "auto": Prefs.auto(act, m.optBoolean("on", true)); data = act.info(); break;
            default: data = false;
        }
        if (m.has("req")) send(new Installer.Ev().put2("type", "reply").put2("req", m.optInt("req")).put2("data", data));
    }

    void send(JSONObject e) {
        if (reply == null) return;
        try { reply.postMessage(e.toString()); } catch (RuntimeException ignored) { } // the page went away
    }
}
