/**
 * Migration: Fix Missing Monthly Payments
 * 
 * Problem: Ba'zi shartnomalar to'liq to'lovlarga ega emas
 * Masalan: 6 oylik shartnoma, lekin faqat 5 ta to'lov bor
 * 
 * Solution: Contract.period va haqiqiy payments.length ni taqqoslab,
 * etishmayotgan to'lovlarni yaratish
 */

import mongoose from 'mongoose';
import Contract from '../schemas/contract.schema';
import Payment, { PaymentType } from '../schemas/payment.schema';
import Notes from '../schemas/notes.schema';
import logger from '../utils/logger';

async function fixMissingMonthlyPayments() {
  try {
    logger.info('🔧 Starting migration: Fix Missing Monthly Payments');
    
    // Barcha active shartnomalarni olish
    const contracts = await Contract.find({
      isDeleted: false,
      status: 'active',
    }).populate('payments');
    
    logger.info(`📊 Found ${contracts.length} active contracts`);
    
    let fixedCount = 0;
    let totalPaymentsCreated = 0;
    
    for (const contract of contracts) {
      const payments = contract.payments as any[];
      
      // Initial to'lovni ajratish
      const initialPayment = payments.find(p => p.paymentType === PaymentType.INITIAL);
      const monthlyPayments = payments.filter(p => p.paymentType === PaymentType.MONTHLY);
      
      // Kutilgan to'lovlar soni = period (chunki initial alohida)
      const expectedMonthlyPayments = contract.period;
      const actualMonthlyPayments = monthlyPayments.length;
      
      if (actualMonthlyPayments < expectedMonthlyPayments) {
        logger.info(`\n📋 Contract ${contract._id} needs fixing:`);
        logger.info(`   Customer: ${(contract.customer as any).fullName}`);
        logger.info(`   Period: ${contract.period} months`);
        logger.info(`   Expected monthly payments: ${expectedMonthlyPayments}`);
        logger.info(`   Actual monthly payments: ${actualMonthlyPayments}`);
        logger.info(`   Missing: ${expectedMonthlyPayments - actualMonthlyPayments}`);
        
        // Etishmayotgan to'lovlarni yaratish
        const startDate = new Date(contract.startDate);
        const originalDay = contract.originalPaymentDay || startDate.getDate();
        
        // Qaysi oylardan boshlab yaratish kerak
        const existingMonths = monthlyPayments.map(p => p.targetMonth).sort((a, b) => a - b);
        
        for (let month = 1; month <= expectedMonthlyPayments; month++) {
          // Agar bu oy uchun to'lov mavjud bo'lsa, skip qilish
          if (existingMonths.includes(month)) {
            continue;
          }
          
          // Yangi to'lov sanasini hisoblash
          const paymentDate = new Date(
            startDate.getFullYear(),
            startDate.getMonth() + month,
            1
          );
          
          // Oyning oxirgi kunini topish
          const lastDayOfMonth = new Date(
            paymentDate.getFullYear(),
            paymentDate.getMonth() + 1,
            0
          ).getDate();
          
          // To'g'ri kunni o'rnatish
          paymentDate.setDate(Math.min(originalDay, lastDayOfMonth));
          
          // To'lovni yaratish
          // ⚠️ MUHIM: Payment schema'da required maydonlar bor
          
          // Notes yaratish (yoki mavjud notes'dan olish)
          let notesId = initialPayment?.notes;
          if (!notesId) {
            // Mavjud to'lovlardan birinchi notes'ni olish
            const anyPaymentWithNotes = monthlyPayments.find(p => p.notes);
            if (anyPaymentWithNotes) {
              notesId = anyPaymentWithNotes.notes;
            } else {
              // Notes yaratish
              const newNotes = await Notes.create({
                text: `Avtomatik yaratilgan ${month}-oy uchun`,
                customer: contract.customer,
                createBy: contract.createBy,
              });
              notesId = newNotes._id;
            }
          }
          
          const newPayment = await Payment.create({
            amount: contract.monthlyPayment,
            date: paymentDate,
            isPaid: false,
            paymentType: PaymentType.MONTHLY,
            targetMonth: month,
            status: 'PENDING',
            customerId: contract.customer,
            managerId: contract.createBy,
            notes: notesId,
          });
          
          // Contract.payments array'ga qo'shish
          contract.payments.push(newPayment._id as any);
          totalPaymentsCreated++;
          
          logger.info(`   ✅ Created payment for month ${month}: ${paymentDate.toISOString().split('T')[0]}`);
        }
        
        // nextPaymentDate ni yangilash
        const unpaidPayments = await Payment.find({
          _id: { $in: contract.payments },
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
        }).sort({ targetMonth: 1 });
        
        if (unpaidPayments.length > 0) {
          contract.nextPaymentDate = unpaidPayments[0].date;
          logger.info(`   ✅ Updated nextPaymentDate: ${contract.nextPaymentDate.toISOString().split('T')[0]}`);
        }
        
        await contract.save();
        fixedCount++;
      }
    }
    
    logger.info(`\n✅ Migration completed successfully!`);
    logger.info(`📊 Fixed contracts: ${fixedCount}`);
    logger.info(`📊 Total payments created: ${totalPaymentsCreated}`);
    
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    throw error;
  }
}

// Agar to'g'ridan-to'g'ri ishga tushirilsa
if (require.main === module) {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nasiya_db';
  
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      logger.info('✅ Connected to MongoDB');
      await fixMissingMonthlyPayments();
      process.exit(0);
    })
    .catch((err) => {
      logger.error('❌ MongoDB connection failed:', err);
      process.exit(1);
    });
}

export default fixMissingMonthlyPayments;
