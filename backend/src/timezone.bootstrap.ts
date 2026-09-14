/**
 * Side-effect module: sets the process timezone before anything else loads.
 *
 * Imported as the very first line of main.ts. A bare call placed between
 * imports would not work reliably - import hoisting moves declarations above
 * statements under ESM - whereas a module's side effect runs when it is first
 * required, which is what "first import" guarantees.
 *
 * dotenv is loaded here too: ConfigModule reads .env during NestFactory.create,
 * which is far too late for a timezone that must apply to the whole process.
 * dotenv does not overwrite variables that are already set, so ConfigModule
 * loading it again afterwards is harmless.
 */
import { config as loadEnv } from 'dotenv';
import { applyAppTimezone } from './common/utils/time.util';

loadEnv();
applyAppTimezone();
