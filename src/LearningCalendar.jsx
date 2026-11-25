import { useState } from 'react';
import './LearningCalendar.css';

function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function LearningCalendar({
  activities = [],
  selectedDate,
  onSelectDate,
  onViewDay,
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const today = getDateString(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const selectedActivities = activities.filter(
    (activity) => activity.activity_date === selectedDate
  );

  function changeMonth(amount) {
    setCurrentMonth(new Date(year, month + amount, 1));
  }

  function selectDay(day) {
    if (!day) return;

    const date = getDateString(new Date(year, month, day));
    onSelectDate(date);
  }

  return (
    <section className="calendar-page">
      <div className="calendar-card">
        <div className="calendar-heading">
          <div>
            <h2>Learning Calendar</h2>
            <p>Explore your learning journey month by month.</p>
          </div>

          <button
            className="calendar-today-button"
            onClick={() => {
              const now = new Date();
              setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              onSelectDate(today);
            }}
          >
            Today
          </button>
        </div>

        <div className="calendar-month-navigation">
          <button onClick={() => changeMonth(-1)} aria-label="Previous month">
            ‹
          </button>

          <h3>
            {currentMonth.toLocaleDateString('en', {
              month: 'long',
              year: 'numeric',
            })}
          </h3>

          <button onClick={() => changeMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>

        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div className="calendar-weekday" key={day}>
              {day}
            </div>
          ))}

          {calendarDays.map((day, index) => {
            if (!day) {
              return (
                <div className="calendar-day empty" key={`empty-${index}`} />
              );
            }

            const date = getDateString(new Date(year, month, day));

            const dayActivities = activities.filter(
              (activity) => activity.activity_date === date
            );

            const hasActivities = dayActivities.length > 0;

            const allCompleted =
              hasActivities &&
              dayActivities.every((activity) => activity.is_completed);

            const isToday = date === today;
            const isSelected = date === selectedDate;

            return (
              <button
                type="button"
                key={date}
                className={[
                  'calendar-day',
                  isToday ? 'today' : '',
                  isSelected ? 'selected' : '',
                  hasActivities ? 'has-activities' : '',
                ].join(' ')}
                onClick={() => selectDay(day)}
              >
                <span>{day}</span>

                {hasActivities && (
                  <span
                    className={`calendar-activity-dot ${
                      allCompleted ? 'completed' : ''
                    }`}
                  />
                )}

                {dayActivities.length > 0 && (
                  <small>{dayActivities.length}</small>
                )}
              </button>
            );
          })}
        </div>

        <div className="calendar-legend">
          <span>
            <i className="legend-dot today-dot" />
            Today
          </span>

          <span>
            <i className="legend-dot planned-dot" />
            Planned activity
          </span>

          <span>
            <i className="legend-dot completed-dot" />
            All completed
          </span>
        </div>
      </div>

      <div className="calendar-selected-card">
        <div className="calendar-selected-heading">
          <div>
            <h3>
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(
                    'en',
                    {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }
                  )
                : 'Select a date'}
            </h3>

            <p>
              {selectedActivities.length} learning{' '}
              {selectedActivities.length === 1 ? 'activity' : 'activities'}
            </p>
          </div>
        </div>

        {selectedActivities.length > 0 ? (
          <div className="calendar-activity-list">
            {selectedActivities
              .slice()
              .sort((a, b) =>
                (a.start_time || '').localeCompare(b.start_time || '')
              )
              .map((activity) => (
                <div className="calendar-activity-item" key={activity.id}>
                  <div className="calendar-activity-time">
                    {activity.start_time?.slice(0, 5) || '--:--'}
                  </div>

                  <div className="calendar-activity-info">
                    <strong>{activity.title}</strong>
                    <span>
                      {activity.is_completed ? '✓ Completed' : 'Planned'}
                    </span>
                  </div>
                </div>
              ))}

            <button className="calendar-view-button" onClick={onViewDay}>
              View this day's timetable →
            </button>
          </div>
        ) : (
          <div className="calendar-empty">
            <span>📅</span>
            <p>No learning activities recorded for this date.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default LearningCalendar;
