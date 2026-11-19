#!/bin/bash
set -e
V=~/workspace/btc-experiment/video
S=$V/src; A=$V/audio; W=$V/work; mkdir -p $W
CLIPS=(
media-generation-joe-s1-cases-0-ae5689ca-196f-424b-a134-d82a05127f52.mp4
media-generation-joe-s2-agent-0-d44f313f-f022-456b-aced-710316eae779.mp4
media-generation-joe-s3-toolbox-0-ed0ccaba-0a91-47b5-b62a-3322438b77d2.mp4
media-generation-joe-s4-cost-0-b39916a1-c2e7-4336-b8d8-d30345340fb5.mp4
media-generation-joe-s5-steps-0-f5f79a6c-a467-4363-984c-aafe0454a009.mp4
media-generation-joe-s6-signoff-0-942cc69f-1036-46cf-b0bf-dbf2aa4a0516.mp4
)
for i in 1 2 3 4 5 6; do
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $A/s$i.mp3)
  TGT=$(python3 -c "print(round($DUR+0.3,3))")
  echo "scene $i audio=$DUR target=$TGT"
  ffmpeg -v error -stream_loop 2 -i "$S/${CLIPS[$((i-1))]}" -i $A/s$i.mp3 -filter_complex \
   "[0:v]scale=1080:1920:flags=lanczos,fps=30,split[a][b];[b]reverse[br];[a][br]concat=n=2:v=1:a=0,trim=duration=$TGT,setpts=PTS-STARTPTS[v];[1:a]apad,atrim=duration=$TGT,asetpts=PTS-STARTPTS[a]" \
   -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 160k $W/scene$i.mp4 -y
done
# End card (5s, silent audio bed)
FONT=$(fc-list | grep -i "DejaVuSans-Bold" | head -1 | cut -d: -f1); echo "font: $FONT"
ffmpeg -v error -f lavfi -i color=c=0x0b0b0f:size=1080x1920:rate=30:duration=5 -f lavfi -i anullsrc=r=48000:cl=stereo -filter_complex \
 "[0:v]drawtext=fontfile='$FONT':text='₿':fontcolor=0xf7931a:fontsize=150:x=(w-text_w)/2:y=560,drawtext=fontfile='$FONT':text='SAVE YOUR LINK':fontcolor=white:fontsize=84:x=(w-text_w)/2:y=800,drawtext=fontfile='$FONT':text='→ GET YOUR AGENT':fontcolor=0xf7931a:fontsize=84:x=(w-text_w)/2:y=920,drawtext=fontfile='$FONT':text='whop.plunderandriffle.com/bridge':fontcolor=0xcccccc:fontsize=44:x=(w-text_w)/2:y=1120,drawtext=fontfile='$FONT':text='An experiment, not a promise. No earnings guaranteed.':fontcolor=0x999999:fontsize=34:x=(w-text_w)/2:y=1560,drawtext=fontfile='$FONT':text='DH Media is a third-party program;':fontcolor=0x999999:fontsize=34:x=(w-text_w)/2:y=1610,drawtext=fontfile='$FONT':text='its terms at dh.media apply.':fontcolor=0x999999:fontsize=34:x=(w-text_w)/2:y=1660[v]" \
 -map "[v]" -map 1:a -t 5 -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 160k $W/endcard.mp4 -y
printf "file '%s'\n" $W/scene1.mp4 $W/scene2.mp4 $W/scene3.mp4 $W/scene4.mp4 $W/scene5.mp4 $W/scene6.mp4 $W/endcard.mp4 > $W/concat.txt
ffmpeg -v error -f concat -safe 0 -i $W/concat.txt -c copy $V/btc-offer-video-9x16.mp4 -y
echo BUILT
