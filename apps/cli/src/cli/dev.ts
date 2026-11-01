import { runCli, writeCliError } from "./cli";

void runCli().catch(writeCliError);
