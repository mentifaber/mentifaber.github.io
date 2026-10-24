// MentiPlayer for Android: a Trusted Web Activity around mentifaber.org/mentiplayer-app, built and signed by .github/workflows/android.yml
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "MentiPlayer"
include(":app")
