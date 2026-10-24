package org.mentifaber.store;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/** The system's answer on each install session Foundry commits. */
public final class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent i) {
        if (!Installer.ACTION.equals(i.getAction())) return;
        String id = i.getStringExtra("id"), name = i.getStringExtra("name"), version = i.getStringExtra("version");
        if (id == null) return;
        if (name == null) name = id;
        boolean bg = i.getBooleanExtra("bg", false);
        int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) { // Android wants the person to confirm this one
            Intent confirm = confirmIntent(i);
            if (confirm == null) { Installer.finished(ctx, id, name, bg, false, "Android didn't ask to confirm the install."); return; }
            Installer.waiting(id);
            if (MainActivity.visible) {
                try { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (RuntimeException ignored) { }
            }
            Notify.confirm(ctx, id, name, confirm);
            return;
        }
        boolean ok = status == PackageInstaller.STATUS_SUCCESS;
        if (ok) { Notify.cancel(ctx, id); if (bg) Notify.updated(ctx, id, name, version); }
        Installer.finished(ctx, id, name, bg && status != PackageInstaller.STATUS_FAILURE_ABORTED, ok, ok ? "Installed" : why(status, i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)));
    }

    @SuppressWarnings("deprecation")
    private static Intent confirmIntent(Intent i) {
        return Build.VERSION.SDK_INT >= 33 ? i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : i.getParcelableExtra(Intent.EXTRA_INTENT);
    }

    private static String why(int status, String msg) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED: return "Cancelled";
            case PackageInstaller.STATUS_FAILURE_STORAGE: return "There isn't enough space on this phone.";
            case PackageInstaller.STATUS_FAILURE_CONFLICT: return "The copy on this phone is signed differently. Remove it, then install from Foundry.";
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE: return "This app doesn't run on this phone.";
            case PackageInstaller.STATUS_FAILURE_BLOCKED: return "This phone blocked the install.";
            case PackageInstaller.STATUS_FAILURE_INVALID: return "The download was damaged. Try again.";
            default: return msg != null && !msg.isEmpty() ? msg : "The install didn't go through.";
        }
    }
}
