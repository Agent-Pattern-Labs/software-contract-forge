#!/usr/bin/env node

import { today } from '../lib/text.mjs';

console.log(today(process.env.TZ || 'America/New_York'));
