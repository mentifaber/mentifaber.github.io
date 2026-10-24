plugins { id("com.android.application") }

// Signed with the same release key as every other Mentifaber app (android/release.jks.enc, unlocked on the build machine
// with the AUTOFABER_KEY_PASSPHRASE secret): Foundry installs only APKs signed by the key that signed Foundry itself.
val keyFile = System.getenv("AF_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
val keyPass = System.getenv("AF_KEY_PASS") ?: ""
val run = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "org.mentifaber.store"
    compileSdk = 34
    defaultConfig {
        applicationId = "org.mentifaber.store"
        minSdk = 24
        targetSdk = 34
        versionCode = 100 + run
        versionName = "1.0.$run"
    }
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

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.work:work-runtime:2.9.1")
}
