import { execSync } from "node:child_process";
export const db = execSync(`security find-generic-password -s svc -a DB -w`).toString().trim();
