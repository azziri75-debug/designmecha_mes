import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

SMTP_SERVER = "smtp.daum.net"
SMTP_PORT = 465
SMTP_USER = "no-reply@designmecha.co.kr"
SMTP_PASSWORD = "ntsyulnwlpqlqbgd" # config에 있는 값
TO_EMAIL = "azziri75@naver.com" # 👈 테스트용 수신자 이메일 기입 (임의의 제 이메일로 변경하거나 사용자가 준 형식대로 둠)

msg = MIMEText("이메일 발송 테스트입니다.", "html")
msg["Subject"] = "[테스트] 시스템 이메일 연동 확인"
msg["From"] = formataddr(("디자인메카", SMTP_USER))
msg["To"] = TO_EMAIL

try:
    print("SMTP 서버 연결 중...")
    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.set_debuglevel(1) # 통신 로그 전체 출력
        print("로그인 시도...")
        server.login(SMTP_USER, SMTP_PASSWORD)
        print("메일 전송 중...")
        server.sendmail(SMTP_USER, TO_EMAIL, msg.as_string())
        print("✅ 성공적으로 발송되었습니다.")
except Exception as e:
    print(f"❌ 발송 실패: {e}")
