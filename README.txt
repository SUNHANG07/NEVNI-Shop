NEVNI SHOP 2.6 - TOSS PAYMENTS V2 FIX

이번 버전은 토스페이먼츠 V2 '결제창형' 연동으로 수정했습니다.
기존의 legacy payment() 호출 때문에 발생했던
'test_ck/live_ck API 개별 연동 키를 사용하세요' 오류를 해결하기 위해
V2 widgets() + renderPaymentWindow() + requestPayment() 방식으로 변경했습니다.

토스페이먼츠 공식 문서 기준:
- V2 결제창형: 주문서형·결제창형 연동 키 사용
- TossPayments(clientKey)
- widgets({customerKey:"ANONYMOUS"})
- setAmount()
- renderPaymentWindow()
- paymentRequest 이벤트
- requestPayment()
- 성공 URL에서 paymentKey/orderId/amount를 서버로 보내 결제 승인

.env:
TOSS_CLIENT_KEY=주문서형·결제창형 테스트 Client Key
TOSS_SECRET_KEY=같은 세트의 테스트 Secret Key

주의:
- 실제 키 전체를 채팅에 보내지 마세요.
- Secret Key는 브라우저 코드에 넣지 않습니다.
- .env 저장 후 반드시 npm.cmd start로 서버를 재시작하세요.

실행:
npm.cmd install
npm.cmd start

관리자:
http://localhost:3000/admin.html
아이디: nevniadmin
비밀번호: nevni!@001
