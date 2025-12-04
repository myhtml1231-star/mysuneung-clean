#!/usr/bin/env bash

# 모든 HTML 파일 처리
for html in *.html; do
  echo "Fixing $html"

  # 모든 batch 폴더 PDF 탐색
  for pdf in batch*/*.pdf; do
    filename=$(basename "$pdf")
    batch=$(dirname "$pdf")

    sed -i "s|href=\"$filename\"|href=\"$batch/$filename\"|g" "$html"
  done
done

git add .
git commit -m "Fix HTML PDF links"
git push
