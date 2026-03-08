import pool from "./db";

const ALL_SLOTS = ["10:00", "11:30", "14:00", "16:30"];

// ─────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────

export async function getAvailableSlots(
  doctorId: string,
  date: string,
): Promise<string[]> {
  // get all slots that are not booked for this doctor+date
  const result = await pool.query(
    `SELECT slot_time::text
     FROM doctor_schedule
     WHERE doctor_id = $1 AND date = $2 AND is_available = true
     ORDER BY slot_time`,
    [doctorId, date],
  );

  if (result.rows.length > 0) {
    // return from DB if slots exist
    return result.rows.map((r) => r.slot_time.slice(0, 5)); // "10:00:00" → "10:00"
  }

  // no rows means this date hasn't been seeded yet — seed it on first access
  await seedDoctorSlots(doctorId, date);
  return ALL_SLOTS;
}

// seed a doctor's slots for a date the first time it's accessed
async function seedDoctorSlots(doctorId: string, date: string) {
  const client = await pool.connect();
  try {
    for (const slot of ALL_SLOTS) {
      await client.query(
        `INSERT INTO doctor_schedule (doctor_id, date, slot_time, is_available)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (doctor_id, date, slot_time) DO NOTHING`,
        [doctorId, date, slot],
      );
    }
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// BOOKING
// ─────────────────────────────────────────

export async function bookAppointmentDB(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
  language = "en",
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ensure slots exist for this date
    await seedDoctorSlots(doctorId, date);

    // check availability with row lock to prevent race conditions
    const check = await client.query(
      `SELECT is_available FROM doctor_schedule
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3
       FOR UPDATE`,
      [doctorId, date, time],
    );

    if (check.rows.length === 0 || !check.rows[0].is_available) {
      await client.query("ROLLBACK");
      const available = await getAvailableSlots(doctorId, date);
      return {
        status: "failed",
        message: "Slot unavailable",
        alternatives: available,
      };
    }

    // mark slot as booked
    await client.query(
      `UPDATE doctor_schedule SET is_available = false
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3`,
      [doctorId, date, time],
    );

    // ensure patient row exists
    await client.query(
      `INSERT INTO patients (id, preferred_language) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [patientId, language],
    );

    // create appointment record
    const result = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, date, time, status, language)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)
       RETURNING id`,
      [patientId, doctorId, date, time, language],
    );

    await client.query("COMMIT");

    return {
      status: "confirmed",
      appointmentId: result.rows[0].id,
      patientId,
      doctorId,
      date,
      time,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────

export async function cancelAppointmentDB(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // update appointment status
    await client.query(
      `UPDATE appointments SET status = 'cancelled', updated_at = NOW()
       WHERE patient_id = $1 AND doctor_id = $2 AND date = $3 AND time = $4
         AND status = 'confirmed'`,
      [patientId, doctorId, date, time],
    );

    // free the slot so others can book it
    await client.query(
      `UPDATE doctor_schedule SET is_available = true
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3`,
      [doctorId, date, time],
    );

    await client.query("COMMIT");
    return { status: "cancelled" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// RESCHEDULE
// ─────────────────────────────────────────

export async function rescheduleAppointmentDB(
  patientId: string,
  doctorId: string,
  oldDate: string,
  oldTime: string,
  newDate: string,
  newTime: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ensure new date slots exist
    await seedDoctorSlots(doctorId, newDate);

    // check new slot availability with lock
    const check = await client.query(
      `SELECT is_available FROM doctor_schedule
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3
       FOR UPDATE`,
      [doctorId, newDate, newTime],
    );

    if (check.rows.length === 0 || !check.rows[0].is_available) {
      await client.query("ROLLBACK");
      const available = await getAvailableSlots(doctorId, newDate);
      return {
        status: "failed",
        message: "New slot unavailable",
        alternatives: available,
      };
    }

    // mark old slot as available again
    await client.query(
      `UPDATE doctor_schedule SET is_available = true
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3`,
      [doctorId, oldDate, oldTime],
    );

    // mark new slot as booked
    await client.query(
      `UPDATE doctor_schedule SET is_available = false
       WHERE doctor_id = $1 AND date = $2 AND slot_time = $3`,
      [doctorId, newDate, newTime],
    );

    // update appointment record
    await client.query(
      `UPDATE appointments
       SET date = $1, time = $2, status = 'confirmed', updated_at = NOW()
       WHERE patient_id = $3 AND doctor_id = $4 AND date = $5 AND time = $6
         AND status = 'confirmed'`,
      [newDate, newTime, patientId, doctorId, oldDate, oldTime],
    );

    await client.query("COMMIT");
    return { status: "confirmed", doctorId, date: newDate, time: newTime };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────
// LIST UPCOMING APPOINTMENTS
// ─────────────────────────────────────────

export async function getUpcomingAppointmentsDB(patientId: string) {
  const result = await pool.query(
    `SELECT a.id, a.doctor_id, a.date::text, a.time::text, a.status,
            d.name as doctor_name, d.specialty
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.patient_id = $1
       AND a.status = 'confirmed'
       AND a.date >= CURRENT_DATE
     ORDER BY a.date ASC, a.time ASC`,
    [patientId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    date: r.date,
    time: r.time.slice(0, 5), // "10:00:00" → "10:00"
    status: r.status,
  }));
}
