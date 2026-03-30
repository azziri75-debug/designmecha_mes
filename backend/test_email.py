import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

SMTP_SERVER = "smtp.daum.net"
SMTP_PORT = 465
SMTP_USER = "azziri@daum.net" # 로그인 ID
SMTP_PASSWORD = "ntsyulnwlpqlqbgd" # 앱 비밀번호 (azziri 계정용 확인 必)
SMTP_SENDER = "no-reply@designmecha.co.kr" # 표시될 주소
TO_EMAIL = "azziri75@naver.com" 

msg = MIMEText("스마트워크 분리 인증 테스트입니다.", "html")
msg["Subject"] = "[테스트] 시스템 이메일 연동 확인"
msg["From"] = formataddr(("디자인메카", SMTP_SENDER))
msg["To"] = TO_EMAIL

try:
    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.set_debuglevel(1)
        server.login(SMTP_USER, SMTP_PASSWORD) # azziri로 로그인
        server.sendmail(SMTP_SENDER, TO_EMAIL, msg.as_string()) # no-reply로 발송
        print("✅ 성공적으로 발송되었습니다.")
except Exception as e:
    print(f"❌ 발송 실패: {e}")
