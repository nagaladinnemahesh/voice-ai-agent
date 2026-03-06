import express from "express";
import { bookAppointment } from "../../scheduler/appointment_engine/bookingService";
import { rescheduleAppointment } from "../../scheduler/appointment_engine/rescheduleService";

const router = express.Router();

// booking a apoointment
router.post("/book", async (req, res) => {
  const { patientId, doctorId, date, time } = req.body;

  const result = await bookAppointment(patientId, doctorId, date, time);

  res.json(result);
});

//rescheduling a appointment
router.post("/reschedule", async (req, res) => {
  const { appointmentId, patientId, doctorId, newDate, newTime } = req.body;

  const result = await rescheduleAppointment(
    appointmentId,
    newDate,
    newTime,
    patientId,
    doctorId,
  );

  res.json(result);
});

export default router;
