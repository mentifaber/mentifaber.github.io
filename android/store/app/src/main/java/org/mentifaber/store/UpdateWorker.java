package org.mentifaber.store;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.IOException;
import java.util.List;

/** Twice a day: are there newer builds of the installed apps? Install them quietly where Android lets the Store
 *  (Android 12+, apps it installed), otherwise say so in a notification. The Store updates itself last. */
public final class UpdateWorker extends Worker {
    public UpdateWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        List<Catalog.App> due;
        try { due = Installer.updates(ctx, Catalog.fetch()); } catch (IOException e) { return Result.retry(); }
        if (due.isEmpty()) { Notify.cancel(ctx, Notify.UPDATES); return Result.success(); }
        if (!(Prefs.auto(ctx) && android.os.Build.VERSION.SDK_INT >= 31 && Installer.canInstall(ctx))) { Notify.updates(ctx, due); return Result.success(); }
        String self = ctx.getPackageName();
        due.sort((x, y) -> Boolean.compare(x.id.equals(self), y.id.equals(self)));
        for (Catalog.App a : due) Installer.installNow(ctx, a);
        return Result.success();
    }
}
