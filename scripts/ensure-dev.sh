#!/bin/bash
# Ensures the Next.js dev server is running and ready.
(lsof -ti:3000 2>/dev/null | xargs -r kill -9) 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null
sleep 1
cd /home/z/my-project
setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
for i in $(seq 1 45); do
  sleep 1
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  if [ "$code" = "200" ]; then echo "DEV READY after ${i}s"; exit 0; fi
done
echo "DEV FAILED TO START"
tail -20 dev.log
exit 1
