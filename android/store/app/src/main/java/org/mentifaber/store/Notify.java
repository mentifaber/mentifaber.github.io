package org.mentifaber.store;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.List;

/** Foundry's notifications: updates waiting, an update that needs a tap, an update done. */
final class Notify {
    static final String UPDATES = "updates";
    private static final String CHANNEL = "updates";

    static void updates(Context c, List<Catalog.App> due) {
        StringBuilder names = new StringBuilder();
        for (Catalog.App a : due) names.append(names.length() > 0 ? ", " : "").append(a.name);
        String title = due.size() == 1 ? "An update for " + due.get(0).name : due.size() + " app updates";
        post(c, UPDATES, title, names + ". Tap to update.", open(c, "#updates", 1));
    }

    static void confirm(Context c, String id, String name, Intent confirm) {
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        post(c, id, name + " is ready", "Tap to finish installing.", PendingIntent.getActivity(c, id.hashCode(), confirm, fl));
    }

    static void updated(Context c, String id, String name, String version) {
        post(c, id, name + " updated", version != null && !version.isEmpty() ? "Now on version " + version + "." : "Now on the latest version.", open(c, "#app/" + id, id.hashCode()));
    }

    static void failed(Context c, String id, String name, String msg) {
        post(c, id, name + " didn't update", msg, open(c, "#app/" + id, id.hashCode()));
    }

    static void cancel(Context c, String tag) { NotificationManager nm = c.getSystemService(NotificationManager.class); if (nm != null) nm.cancel(tag, 1); }

    private static PendingIntent open(Context c, String hash, int code) {
        Intent i = new Intent(c, MainActivity.class).putExtra("hash", hash).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    private static void post(Context c, String tag, String title, String text, PendingIntent tap) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(c, CHANNEL);
        } else b = new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat).setColor(0xFFF0B24A).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(tap).setAutoCancel(true);
        try { nm.notify(tag, 1, b.build()); } catch (SecurityException ignored) { } // notifications turned off
    }
}
