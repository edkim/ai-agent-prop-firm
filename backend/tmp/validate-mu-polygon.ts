/**
 * Validate MU 2025-10-23 data against Polygon API
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function validateMU() {
  const ticker = 'MU';
  const date = '2025-10-23';

  // Polygon aggregates endpoint for 5-minute bars
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${date}/${date}`;

  try {
    const response = await axios.get(url, {
      params: {
        apiKey: POLYGON_API_KEY,
        adjusted: true,
        sort: 'asc',
        limit: 50000
      },
      timeout: 30000
    });

    const bars = response.data.results || [];

    console.log(`\n📊 Polygon API Response for ${ticker} ${date}`);
    console.log(`Total bars returned: ${bars.length}\n`);

    // Filter for RTH bars (09:30-16:00 ET)
    // Polygon timestamps are in milliseconds UTC
    // ET is UTC-4 (EDT) or UTC-5 (EST) - Oct 23 is EDT
    const rthBars = bars.filter((bar: any) => {
      const dt = new Date(bar.t);
      const hour = dt.getUTCHours();
      const minute = dt.getUTCMinutes();

      // EDT is UTC-4, so 09:30 ET = 13:30 UTC
      // RTH: 09:30-16:00 ET = 13:30-20:00 UTC
      const utcMinutes = hour * 60 + minute;
      return utcMinutes >= 13 * 60 + 30 && utcMinutes <= 20 * 60;
    });

    console.log(`RTH bars (09:30-16:00 ET): ${rthBars.length}\n`);

    // Show first few bars
    console.log('First 5 RTH bars:');
    for (let i = 0; i < Math.min(5, rthBars.length); i++) {
      const bar = rthBars[i];
      const dt = new Date(bar.t);
      const et = new Date(bar.t - 4 * 60 * 60 * 1000); // EDT = UTC-4
      console.log(`${et.toISOString().substring(11, 16)} ET: O=${bar.o.toFixed(2)} H=${bar.h.toFixed(2)} L=${bar.l.toFixed(2)} C=${bar.c.toFixed(2)} V=${bar.v}`);
    }

    // Find 11:40 and 11:45 bars specifically
    console.log('\n🔍 Looking for 11:40 and 11:45 ET bars:');

    const bar1140 = rthBars.find((bar: any) => {
      const dt = new Date(bar.t);
      const hour = dt.getUTCHours();
      const minute = dt.getUTCMinutes();
      return hour === 15 && minute === 40; // 11:40 ET = 15:40 UTC
    });

    const bar1145 = rthBars.find((bar: any) => {
      const dt = new Date(bar.t);
      const hour = dt.getUTCHours();
      const minute = dt.getUTCMinutes();
      return hour === 15 && minute === 45; // 11:45 ET = 15:45 UTC
    });

    if (bar1140) {
      console.log(`11:40 ET: Open=${bar1140.o.toFixed(2)} High=${bar1140.h.toFixed(2)} Low=${bar1140.l.toFixed(2)} Close=${bar1140.c.toFixed(2)}`);
    } else {
      console.log('11:40 ET: NOT FOUND');
    }

    if (bar1145) {
      console.log(`11:45 ET: Open=${bar1145.o.toFixed(2)} High=${bar1145.h.toFixed(2)} Low=${bar1145.l.toFixed(2)} Close=${bar1145.c.toFixed(2)}`);
    } else {
      console.log('11:45 ET: NOT FOUND');
    }

    // Show opening range bar (09:30)
    console.log('\n🎯 Opening Range (09:30 ET):');
    const orBar = rthBars.find((bar: any) => {
      const dt = new Date(bar.t);
      const hour = dt.getUTCHours();
      const minute = dt.getUTCMinutes();
      return hour === 13 && minute === 30; // 09:30 ET = 13:30 UTC
    });

    if (orBar) {
      console.log(`09:30 ET: Open=${orBar.o.toFixed(2)} High=${orBar.h.toFixed(2)} Low=${orBar.l.toFixed(2)} Close=${orBar.c.toFixed(2)}`);
      console.log(`OR Range: ${orBar.l.toFixed(2)} - ${orBar.h.toFixed(2)}`);
    }

  } catch (error: any) {
    console.error('Error fetching data:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

validateMU();
