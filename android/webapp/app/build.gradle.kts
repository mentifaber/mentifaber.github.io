plugins { id("com.android.application") }

// The release key comes from the build machine (decrypted from android/release.jks.enc with the AUTOFABER_KEY_PASSPHRASE secret);
// without it the build is signed with a throwaway debug key, which installs fine but can't update a release-signed copy.
val keyFile = System.getenv("AF_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
val keyPass = System.getenv("AF_KEY_PASS") ?: ""
val run = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

// Which app this build is: the workflow sets these from android/apps.json (as ORG_GRADLE_PROJECT_app* variables)
fun prop(k: String, d: String) = (findProperty(k) as String?)?.takeIf { it.isNotBlank() } ?: d
val appId = prop("appId", "org.mentifaber.webapp")
val appName = prop("appName", "Mentifaber")
val appPath = prop("appPath", "/")
val appBg = prop("appBg", "#08080A")
val appIcon = prop("appIcon", "/assets/icons/v2/store-512.png")          // the 512 px logo; the 192 px one sits beside it
val appDisplay = prop("appDisplay", "default")                          // "immersive" for games: no status or navigation bar

// the app's logo, from the site's own icons: the launcher icon and the splash
val repo = rootDir.resolve("../..")
val iconRes = layout.buildDirectory.dir("generated/icon-res")
val icons = tasks.register<Copy>("appIcons") {
    from(repo.resolve(appIcon.trimStart('/').replace("-512.png", "-192.png"))) { rename { "ic_launcher.png" }; into("mipmap-xxxhdpi") }
    from(repo.resolve(appIcon.trimStart('/'))) { rename { "splash.png" }; into("drawable-nodpi") }
    into(iconRes)
}
tasks.named("preBuild") { dependsOn(icons) }

android {
    namespace = "org.mentifaber.webapp"
    compileSdk = 34
    defaultConfig {
        applicationId = appId
        minSdk = 21
        targetSdk = 34
        versionCode = 100 + run
        versionName = "1.0.$run"
        resValue("string", "app_name", appName)
        resValue("string", "launch_url", "https://mentifaber.org$appPath?from=android")
        resValue("color", "bg", appBg)
        manifestPlaceholders["appPath"] = appPath
        manifestPlaceholders["appDisplay"] = appDisplay
    }
    sourceSets["main"].res.srcDir(iconRes)
    signingConfigs {
        if (keyFile != null) create("release") { storeFile = keyFile; storePassword = keyPass; keyAlias = "autofaber"; keyPassword = keyPass }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = if (keyFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0") }
