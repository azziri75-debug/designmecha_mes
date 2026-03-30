import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

def send_approval_email(to_email: str, doc_title: str, drafter_name: str, reference_id: str):
    if not to_email:
        return

    subject = f"[결재요청] {drafter_name}님의 '{doc_title}' 결재가 대기 중입니다."
    # 실서버 URL 기준 링크 생성
    doc_url = f"https://dmmes.synology.me/approval" 

    html_content = f"""
    <html>
        <body style="font-family: 'Malgun Gothic', sans-serif; color: #333;">
            <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; max-width: 600px;">
                <h2 style="color: #003AC1;">결재 요청 알림</h2>
                <p><strong>{drafter_name}</strong>님이 상신한 문서의 결재 순서가 도래했습니다.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #003AC1; margin: 15px 0;">
                    <p style="margin: 0;"><strong>문서 제목:</strong> {doc_title}</p>
                </div>
                <p>아래 버튼을 클릭하여 MES 시스템에서 결재를 진행해 주십시오.</p>
                <a href="{doc_url}" style="display: inline-block; padding: 10px 20px; background-color: #003AC1; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">결재 문서 확인하기</a>
            </div>
        </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"디자인메카 결재시스템 <{settings.SMTP_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html"))

    try:
        # Daum SMTP SSL 연결
        with smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
    except Exception as e:
        print(f"Failed to send email to {to_email}: {str(e)}")
