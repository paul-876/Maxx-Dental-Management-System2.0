#!/usr/bin/env bash
# End-to-end smoke test of the core patient workflow described in the
# requirements doc: registration -> appointment -> checkin -> front desk ->
# dentist -> cashier -> pharmacy -> visit completed.
set -e
BASE="http://localhost:4000/api"
jqf() { python3 -c "import sys, json; print(json.load(sys.stdin)$1)"; }

echo "== Login as each role =="
ADMIN_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"identifier":"0700000001","password":"Admin@123"}' | jqf "['token']")
FRONTDESK_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"identifier":"0700000002","password":"FrontDesk@123"}' | jqf "['token']")
DENTIST_LOGIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"identifier":"0700000005","password":"Dentist@123"}')
DENTIST_TOKEN=$(echo $DENTIST_LOGIN | jqf "['token']")
DENTIST_USER_ID=$(echo $DENTIST_LOGIN | jqf "['user']['id']")
DENTIST_ID=$(echo $DENTIST_LOGIN | jqf "['user']['dentistId']")
echo "OK — Super Admin, Front Desk (shared), and Dentist all authenticated. Dentist profile id: $DENTIST_ID"

echo "== Step 1: Register patient =="
PHONE=$(printf "07%08d" $((RANDOM % 100000000)))
PATIENT=$(curl -s -X POST $BASE/patients -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"phoneNumber\":\"$PHONE\",\"name\":\"Jane Test Patient\",\"gender\":\"FEMALE\"}")
PATIENT_ID=$(echo $PATIENT | jqf "['id']")
echo "Registered patient $PATIENT_ID with phone $(echo $PATIENT | jqf "['phoneNumber']")"

echo "== Duplicate registration should be rejected =="
DUPE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/patients -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"phoneNumber\":\"$PHONE\",\"name\":\"Jane Test Patient\"}")
[ "$DUPE" = "409" ] && echo "OK — duplicate phone rejected with 409" || (echo "FAIL — expected 409, got $DUPE"; exit 1)

echo "== Step 2: Book appointment =="
APPT=$(curl -s -X POST $BASE/appointments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\",\"appointmentDate\":\"2026-09-01\",\"appointmentTime\":\"10:00\",\"reason\":\"Checkup\"}")
echo "Appointment created: $(echo $APPT | jqf "['id']")"

echo "== Step 3: Check patient in (ticket generated) =="
CHECKIN=$(curl -s -X POST $BASE/workflow/checkin -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\"}")
TICKET=$(echo $CHECKIN | jqf "['ticketNumber']")
echo "Ticket: $TICKET, status: $(echo $CHECKIN | jqf "['patient']['status']")"

echo "== Step 4: Front Desk sends to Dentist =="
SEND=$(curl -s -X POST $BASE/workflow/send-to-dentist -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\"}")
echo "Status after send-to-dentist: $(echo $SEND | jqf "['patient']['status']")"

echo "== Dentist queue should contain the patient =="
QUEUE=$(curl -s "$BASE/workflow/queue/DENTIST?dentistId=$DENTIST_USER_ID" -H "Authorization: Bearer $DENTIST_TOKEN")
QLEN=$(echo $QUEUE | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$QLEN" -ge 1 ] && echo "OK — patient visible in dentist queue" || (echo "FAIL — patient not in dentist queue"; exit 1)

echo "== Step 5: Dentist accepts, examines, diagnoses, treats, prescribes =="
curl -s -X POST $BASE/workflow/accept -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\"}" > /dev/null

RECORD=$(curl -s -X POST $BASE/dental/records -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\",\"complaint\":\"Toothache\",\"examinationFindings\":\"Cavity on molar\",\"diagnosis\":\"Dental caries\"}")
echo "Dental record: $(echo $RECORD | jqf "['id']")"

PLAN=$(curl -s -X POST $BASE/dental/treatment-plans -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\",\"treatmentName\":\"Filling\",\"estimatedCost\":2000}")
echo "Treatment plan: $(echo $PLAN | jqf "['id']")"

TREC=$(curl -s -X POST $BASE/dental/treatment-records -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\",\"treatment\":\"Composite filling\",\"treatmentPlanId\":\"$(echo $PLAN | jqf "['id']")\"}")
echo "Treatment record: $(echo $TREC | jqf "['id']")"

MEDS=$(curl -s $BASE/medicines -H "Authorization: Bearer $DENTIST_TOKEN")
MED_ID=$(echo $MEDS | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
RX=$(curl -s -X POST $BASE/prescriptions -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"dentistId\":\"$DENTIST_ID\",\"items\":[{\"medicineId\":\"$MED_ID\",\"dosage\":\"1 tablet\",\"frequency\":\"3x daily\",\"duration\":\"5 days\"}]}")
RX_ID=$(echo $RX | jqf "['id']")
ITEM_ID=$(echo $RX | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")
echo "Prescription: $RX_ID"

curl -s -X POST $BASE/dental/complete-treatment -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\"}" > /dev/null

echo "== Step 6: Dentist sends patient to Cashier =="
TOCASH=$(curl -s -X POST $BASE/workflow/send-to-next -H "Content-Type: application/json" -H "Authorization: Bearer $DENTIST_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"toDepartment\":\"CASHIER\"}")
echo "Status: $(echo $TOCASH | jqf "['patient']['status']")"

echo "== Step 7: Cashier records payment, receipt is generated =="
PAY=$(curl -s -X POST $BASE/payments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"amount\":2000,\"paymentMethod\":\"CASH\",\"serviceDescription\":\"Filling\"}")
PAY_ID=$(echo $PAY | jqf "['payment']['id']")
RECEIPT_NO=$(echo $PAY | jqf "['receipt']['receiptNumber']")
echo "Payment $PAY_ID recorded, receipt $RECEIPT_NO"

RECEIPT=$(curl -s $BASE/payments/$PAY_ID/receipt -H "Authorization: Bearer $FRONTDESK_TOKEN")
echo "Receipt view OK: $(echo $RECEIPT | jqf "['receiptNumber']")"

echo "== Cashier sends patient to Pharmacy =="
TOPHARM=$(curl -s -X POST $BASE/workflow/send-to-next -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"toDepartment\":\"PHARMACY\"}")
echo "Status: $(echo $TOPHARM | jqf "['patient']['status']")"

echo "== Step 8: Pharmacy dispenses medication =="
DISPENSE=$(curl -s -X PATCH $BASE/prescriptions/items/$ITEM_ID/dispense -H "Authorization: Bearer $FRONTDESK_TOKEN")
echo "Dispense result: $(echo $DISPENSE | jqf "['prescriptionStatus']")"

curl -s -X POST $BASE/prescriptions/$RX_ID/complete-dispensing -H "Authorization: Bearer $FRONTDESK_TOKEN" > /dev/null

echo "== Step 9: Complete visit =="
DONE=$(curl -s -X POST $BASE/workflow/complete-visit -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\"}")
FINAL_STATUS=$(echo $DONE | jqf "['patient']['status']")
[ "$FINAL_STATUS" = "Visit Completed" ] && echo "OK — visit marked completed" || (echo "FAIL — status is $FINAL_STATUS"; exit 1)

echo "== Transfer history for audit trail =="
HIST=$(curl -s $BASE/workflow/history/$PATIENT_ID -H "Authorization: Bearer $ADMIN_TOKEN")
HLEN=$(echo $HIST | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Transfer history entries: $HLEN"

echo "== Reports (Super Admin dashboard) =="
DASH=$(curl -s $BASE/reports/dashboard -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$DASH" | python3 -m json.tool

echo "== Billing: create an itemized invoice =="
INVOICE=$(curl -s -X POST $BASE/invoices -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"items\":[{\"description\":\"Smoke test item\",\"quantity\":1,\"unitPrice\":1000}],\"discount\":100}")
INVOICE_ID=$(echo $INVOICE | jqf "['id']")
INVOICE_TOTAL=$(echo $INVOICE | jqf "['totalAmount']")
[ "$INVOICE_TOTAL" = "900.00" ] && echo "OK — invoice $INVOICE_ID totals 900.00 after discount" || (echo "FAIL — expected total 900.00, got $INVOICE_TOTAL"; exit 1)

echo "== Billing: reject a payment that exceeds the invoice balance =="
OVERPAY=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/payments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"invoiceId\":\"$INVOICE_ID\",\"amount\":5000,\"paymentMethod\":\"CASH\"}")
[ "$OVERPAY" = "400" ] && echo "OK — overpayment rejected with 400" || (echo "FAIL — expected 400, got $OVERPAY"; exit 1)

echo "== Billing: partial payment against the invoice =="
PARTIAL=$(curl -s -X POST $BASE/payments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"invoiceId\":\"$INVOICE_ID\",\"amount\":400,\"paymentMethod\":\"CASH\"}")
PSTATUS=$(echo $PARTIAL | jqf "['invoice']['status']")
[ "$PSTATUS" = "PARTIALLY_PAID" ] && echo "OK — invoice is PARTIALLY_PAID after a 400 payment" || (echo "FAIL — expected PARTIALLY_PAID, got $PSTATUS"; exit 1)

echo "== Billing: outstanding total reflects the open invoice balance (500) =="
OUT=$(curl -s $BASE/payments/outstanding/$PATIENT_ID -H "Authorization: Bearer $FRONTDESK_TOKEN")
OUT_TOTAL=$(echo $OUT | jqf "['totalOutstanding']")
[ "$OUT_TOTAL" = "500" ] && echo "OK — outstanding total is 500" || (echo "FAIL — expected 500, got $OUT_TOTAL"; exit 1)

echo "== Billing: pay the remainder — invoice should become PAID =="
FINAL_PAY=$(curl -s -X POST $BASE/payments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"invoiceId\":\"$INVOICE_ID\",\"amount\":500,\"paymentMethod\":\"MPESA\"}")
FSTATUS=$(echo $FINAL_PAY | jqf "['invoice']['status']")
[ "$FSTATUS" = "PAID" ] && echo "OK — invoice fully paid" || (echo "FAIL — expected PAID, got $FSTATUS"; exit 1)

echo "== Billing: a fully-paid invoice cannot be voided or paid again =="
REPAY=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/payments -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"invoiceId\":\"$INVOICE_ID\",\"amount\":10,\"paymentMethod\":\"CASH\"}")
[ "$REPAY" = "400" ] && echo "OK — payment on a fully-paid invoice rejected with 400" || (echo "FAIL — expected 400, got $REPAY"; exit 1)
VOID_PAID=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/invoices/$INVOICE_ID/void -H "Authorization: Bearer $FRONTDESK_TOKEN")
[ "$VOID_PAID" = "400" ] && echo "OK — voiding a paid invoice rejected with 400" || (echo "FAIL — expected 400, got $VOID_PAID"; exit 1)

echo "== Billing: an unpaid invoice can be voided =="
INVOICE2=$(curl -s -X POST $BASE/invoices -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"patientId\":\"$PATIENT_ID\",\"items\":[{\"description\":\"Void me\",\"quantity\":1,\"unitPrice\":300}]}")
INVOICE2_ID=$(echo $INVOICE2 | jqf "['id']")
VOID_OK=$(curl -s -X PATCH $BASE/invoices/$INVOICE2_ID/void -H "Authorization: Bearer $FRONTDESK_TOKEN")
VSTATUS=$(echo $VOID_OK | jqf "['status']")
[ "$VSTATUS" = "VOID" ] && echo "OK — unpaid invoice voided" || (echo "FAIL — expected VOID, got $VSTATUS"; exit 1)

echo "== Reports: financial trend, by-service, by-dentist, outstanding-patients, CSV exports (Super Admin only) =="
curl -sf $BASE/reports/financial/trend -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && echo "OK — /reports/financial/trend"
curl -sf $BASE/reports/financial/by-service -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && echo "OK — /reports/financial/by-service"
curl -sf $BASE/reports/financial/by-dentist -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && echo "OK — /reports/financial/by-dentist"
curl -sf $BASE/reports/outstanding-patients -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && echo "OK — /reports/outstanding-patients"
CSV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/reports/export/payments.csv -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$CSV_STATUS" = "200" ] && echo "OK — payments CSV export" || (echo "FAIL — expected 200, got $CSV_STATUS"; exit 1)
REPORT_DENIED=$(curl -s -o /dev/null -w "%{http_code}" $BASE/reports/financial/trend -H "Authorization: Bearer $FRONTDESK_TOKEN")
[ "$REPORT_DENIED" = "403" ] && echo "OK — non-admin blocked from reports with 403" || (echo "FAIL — expected 403, got $REPORT_DENIED"; exit 1)

echo "== Internal chat: Front Desk posts to the clinic group =="
GROUP_MSG=$(curl -s -X POST $BASE/messages -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d '{"groupName":"CLINIC","message":"Smoke test group message"}')
echo "Posted: $(echo $GROUP_MSG | jqf "['id']")"

echo "== Dentist reads the clinic group (default thread) =="
DGROUP=$(curl -s $BASE/messages -H "Authorization: Bearer $DENTIST_TOKEN")
DGLEN=$(echo $DGROUP | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$DGLEN" -ge 1 ] && echo "OK — dentist sees $DGLEN clinic group message(s)" || (echo "FAIL — dentist sees no group messages"; exit 1)

echo "== Front Desk DMs the Dentist directly =="
DM=$(curl -s -X POST $BASE/messages -H "Content-Type: application/json" -H "Authorization: Bearer $FRONTDESK_TOKEN" -d "{\"receiverId\":\"$DENTIST_USER_ID\",\"message\":\"Smoke test direct message\"}")
echo "DM sent: $(echo $DM | jqf "['id']")"

echo "== Only Super Admin can access full chat history =="
DENIED=$(curl -s -o /dev/null -w "%{http_code}" $BASE/messages/all -H "Authorization: Bearer $FRONTDESK_TOKEN")
[ "$DENIED" = "403" ] && echo "OK — non-admin blocked from /messages/all with 403" || (echo "FAIL — expected 403, got $DENIED"; exit 1)

ALL_MSGS=$(curl -s $BASE/messages/all -H "Authorization: Bearer $ADMIN_TOKEN")
ALEN=$(echo $ALL_MSGS | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$ALEN" -ge 2 ] && echo "OK — Super Admin sees full chat history ($ALEN messages, including the group post and DM above)" || (echo "FAIL — expected at least 2 messages in full history, got $ALEN"; exit 1)

echo
echo "===== ALL WORKFLOW STEPS PASSED ====="
