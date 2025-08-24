xh PUT \
  :28139/file.txt \
  Content-Type:application/x-www-form-urlencoded \
  @file.txt


xh PUT \
  :28139/myfile.jpg \
  Content-Type:application/x-www-form-urlencoded \
  "params==perurltoo" \
  @myfile.jpg


xh --form \
  :28139 \
  Content-Type:application/x-www-form-urlencoded \
  "fooo=blah"


xh --form \
  :28139 \
  Content-Type:application/x-www-form-urlencoded \
  "different=data" \
  "time=now"
