/**
 * Konfimiseks: asenda WEBHOOK_URL ja SECRET kui Apps Script on deploytud.
 * projectId: kui sul on see kindlalt teada host-keskkonnast, võid selle siia panna
 * (muidu lugeksime nt URL-ist või saaks Trimble API-st).
 */
export const CONFIG = {
  WEBHOOK_URL: "",              // nt "https://script.google.com/macros/s/DEPLOY_ID/exec"
  SHARED_SECRET: "",            // sama mis Apps Scripti SECRET
  DEFAULT_PROJECT_ID: ""        // valikuline; kui saad TC-st, jäta tühjaks
};
