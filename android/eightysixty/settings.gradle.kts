// Eightysixty for Android: the remote page (mentifaber.org/roku-app) with a line to the Rokus on this Wi-Fi; built and signed by .github/workflows/android.yml
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "Eightysixty"
include(":app")
