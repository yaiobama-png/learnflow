import { useEffect, useState } from 'react';
import './App.css';
import { supabase } from './supabaseClient';
import Login from './Login';
import ActivityMaterials from './ActivityMaterials';
import LearningCalendar from './LearningCalendar';

function getToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().split('T')[0];
}

function getDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDuration(start, end) {
  if (!start || !end) return 0;
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  return Math.max(0, endMinutes - startMinutes);
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('learnflow-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });

  const [activities, setActivities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getToday());

  const [showForm, setShowForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [activePage, setActivePage] = useState('timetable');

  const [dashboardActivities, setDashboardActivities] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardRefresh, setDashboardRefresh] = useState(0);

  // Learning Goals
  const [dailyGoal, setDailyGoal] = useState('2');
  const [weeklyGoal, setWeeklyGoal] = useState('10');
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsSaving, setGoalsSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [message, setMessage] = useState('');

  const emptyActivity = {
    time: '09:00',
    endTime: '10:00',
    title: '',
    category: '',
    planned: '',
    actual: '',
  };

  const [newActivity, setNewActivity] = useState(emptyActivity);

  // Apply and persist the selected appearance across sessions.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('learnflow-theme', theme); } catch { /* storage may be unavailable */ }
  }, [theme]);

  // Authentication
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error(error.message);
      setSession(data.session);
      setAuthLoading(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load user's Learning Goals
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadGoals() {
      setGoalsLoading(true);

      const { data, error } = await supabase
        .from('learning_goals')
        .select('daily_goal_hours, weekly_goal_hours')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setMessage('Could not load learning goals: ' + error.message);
      } else if (data) {
        setDailyGoal(String(data.daily_goal_hours));
        setWeeklyGoal(String(data.weekly_goal_hours));
      }

      setGoalsLoading(false);
    }

    loadGoals();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Save Learning Goals
  async function saveGoals(e) {
    e.preventDefault();

    const daily = Number(dailyGoal);
    const weekly = Number(weeklyGoal);

    if (
      !Number.isFinite(daily) ||
      !Number.isFinite(weekly) ||
      daily <= 0 ||
      weekly <= 0 ||
      daily > 24 ||
      weekly > 168
    ) {
      setMessage(
        'Please enter valid goals. Daily: up to 24 hours. Weekly: up to 168 hours.'
      );
      return;
    }

    setGoalsSaving(true);
    setMessage('');

    const { error } = await supabase.from('learning_goals').upsert(
      {
        user_id: session.user.id,
        daily_goal_hours: daily,
        weekly_goal_hours: weekly,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      setMessage('Could not save learning goals: ' + error.message);
    } else {
      setDailyGoal(String(daily));
      setWeeklyGoal(String(weekly));
      setMessage('Learning goals saved successfully!');
    }

    setGoalsSaving(false);
  }

  // Load categories and selected day's activities
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setMessage('');

      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id, name, is_default')
        .order('name');

      if (cancelled) return;

      if (categoryError) {
        setMessage('Category loading error: ' + categoryError.message);
      } else {
        setCategories(categoryData || []);
      }

      const { data, error } = await supabase
        .from('learning_activities')
        .select(
          `
          id, title, activity_date, start_time, end_time,
          planned_notes, actual_notes, is_completed, category_id
        `
        )
        .eq('user_id', session.user.id)
        .eq('activity_date', selectedDate)
        .order('start_time', { ascending: true });

      if (cancelled) return;

      if (error) {
        setMessage('Could not load activities: ' + error.message);
      } else {
        setActivities(
          (data || []).map((item) => ({
            id: item.id,
            time: item.start_time?.slice(0, 5) || '09:00',
            endTime: item.end_time?.slice(0, 5) || '',
            title: item.title,
            category:
              categoryData?.find((cat) => cat.id === item.category_id)?.name ||
              '',
            planned: item.planned_notes || '',
            actual: item.actual_notes || '',
            completed: item.is_completed,
          }))
        );
      }

      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [session, selectedDate]);

  // Load all learning activities for dashboard and calendar
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadDashboardActivities() {
      setDashboardLoading(true);

      const { data, error } = await supabase
        .from('learning_activities')
        .select(
          `
          id, title, activity_date, start_time, end_time,
          is_completed, category_id
        `
        )
        .eq('user_id', session.user.id)
        .order('activity_date', { ascending: true });

      if (cancelled) return;

      if (error) {
        setMessage('Could not load dashboard data: ' + error.message);
      } else {
        setDashboardActivities(data || []);
      }

      setDashboardLoading(false);
    }

    loadDashboardActivities();

    return () => {
      cancelled = true;
    };
  }, [session, dashboardRefresh]);

  function refreshDashboard() {
    setDashboardRefresh((previous) => previous + 1);
  }

  async function refreshCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, is_default')
      .order('name');

    if (error) {
      setMessage('Could not load categories: ' + error.message);
      return;
    }

    setCategories(data || []);
  }

  async function refreshActivities() {
    const { data, error } = await supabase
      .from('learning_activities')
      .select(
        `
        id, title, start_time, end_time, planned_notes,
        actual_notes, is_completed, category_id
      `
      )
      .eq('user_id', session.user.id)
      .eq('activity_date', selectedDate)
      .order('start_time', { ascending: true });

    if (error) {
      setMessage('Could not refresh activities: ' + error.message);
      return;
    }

    setActivities(
      (data || []).map((item) => ({
        id: item.id,
        time: item.start_time?.slice(0, 5) || '09:00',
        endTime: item.end_time?.slice(0, 5) || '',
        title: item.title,
        category:
          categories.find((cat) => cat.id === item.category_id)?.name || '',
        planned: item.planned_notes || '',
        actual: item.actual_notes || '',
        completed: item.is_completed,
      }))
    );

    refreshDashboard();
  }

  async function addCategory(e) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    const alreadyExists = categories.some(
      (category) => category.name.toLowerCase() === name.toLowerCase()
    );

    if (alreadyExists) {
      setMessage('This category already exists.');
      return;
    }

    setCategorySaving(true);
    setMessage('');

    const { error } = await supabase.from('categories').insert({
      user_id: session.user.id,
      name,
      is_default: false,
    });

    if (error) {
      setMessage('Could not create category: ' + error.message);
    } else {
      setNewCategoryName('');
      setMessage('Category created successfully!');
      await refreshCategories();
    }

    setCategorySaving(false);
  }

  async function deleteCategory(category) {
    if (category.is_default) {
      setMessage('Default categories cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Delete the category "${category.name}"?`);
    if (!confirmed) return;

    setMessage('');

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', category.id)
      .eq('user_id', session.user.id)
      .eq('is_default', false);

    if (error) {
      setMessage('Could not delete category: ' + error.message);
      return;
    }

    setMessage('Category deleted successfully!');
    await refreshCategories();
    await refreshActivities();
  }

  function openAddForm() {
    setEditingId(null);
    setNewActivity({
      ...emptyActivity,
      category: categories[0]?.name || '',
    });
    setShowForm(true);
    setMessage('');
  }

  function openEditForm(activity) {
    setEditingId(activity.id);
    setNewActivity({
      time: activity.time,
      endTime: activity.endTime,
      title: activity.title,
      category: activity.category,
      planned: activity.planned,
      actual: activity.actual,
    });
    setShowForm(true);
    setMessage('');
  }

  async function saveActivity(e) {
    e.preventDefault();

    if (!newActivity.title.trim()) return;

    if (newActivity.endTime && newActivity.endTime <= newActivity.time) {
      setMessage('End time must be later than start time.');
      return;
    }

    setSaving(true);
    setMessage('');

    const selectedCategory = categories.find(
      (cat) => cat.name === newActivity.category
    );

    const activityData = {
      category_id: selectedCategory?.id || null,
      title: newActivity.title.trim(),
      activity_date: selectedDate,
      start_time: newActivity.time,
      end_time: newActivity.endTime || null,
      planned_notes: newActivity.planned,
      actual_notes: newActivity.actual,
    };

    let error;

    if (editingId) {
      const result = await supabase
        .from('learning_activities')
        .update(activityData)
        .eq('id', editingId)
        .eq('user_id', session.user.id);

      error = result.error;
    } else {
      const result = await supabase.from('learning_activities').insert({
        ...activityData,
        user_id: session.user.id,
        is_completed: false,
      });

      error = result.error;
    }

    if (error) {
      setMessage('Could not save activity: ' + error.message);
      setSaving(false);
      return;
    }

    const wasEditing = Boolean(editingId);

    setShowForm(false);
    setEditingId(null);
    setNewActivity(emptyActivity);
    setSaving(false);

    setMessage(
      wasEditing
        ? 'Activity updated successfully!'
        : 'Activity added successfully!'
    );

    await refreshActivities();
  }

  async function deleteActivity(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this activity?'
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('learning_activities')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage('Could not delete activity: ' + error.message);
      return;
    }

    setActivities((previous) => previous.filter((item) => item.id !== id));
    setMessage('Activity deleted successfully!');
    refreshDashboard();
  }

  async function toggleComplete(id) {
    const activity = activities.find((item) => item.id === id);
    if (!activity) return;

    const newStatus = !activity.completed;

    const { error } = await supabase
      .from('learning_activities')
      .update({ is_completed: newStatus })
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage('Could not update activity: ' + error.message);
      return;
    }

    setActivities((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completed: newStatus } : item
      )
    );

    refreshDashboard();
  }

  async function updateActual(id, value) {
    setActivities((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, actual: value } : item
      )
    );

    const { error } = await supabase
      .from('learning_activities')
      .update({ actual_notes: value })
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage('Could not save notes: ' + error.message);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  }

  function openTimetable() {
    setActivePage('timetable');
    setShowCategoryManager(false);
    setShowForm(false);
    setMessage('');
  }

  function openHistory() {
    setActivePage('history');
    setShowCategoryManager(false);
    setShowForm(false);
    setMessage('');
  }

  function openDashboard() {
    setActivePage('dashboard');
    setShowCategoryManager(false);
    setShowForm(false);
    setMessage('');
    refreshDashboard();
  }

  // Open Learning Calendar
  function openCalendar() {
    setActivePage('calendar');
    setShowCategoryManager(false);
    setShowForm(false);
    setMessage('');
    refreshDashboard();
  }

  // Open the selected date in the timetable
  function openCalendarDay() {
    setActivePage('timetable');
    setShowCategoryManager(false);
    setShowForm(false);
    setMessage('');
  }

  if (authLoading) {
    return <div className="app-loading">Loading LearnFlow...</div>;
  }

  if (!session) {
    return <Login theme={theme} setTheme={setTheme} />;
  }

  // Daily statistics
  const completed = activities.filter((activity) => activity.completed).length;
  const unfinished = activities.length - completed;

  const progress = activities.length
    ? Math.round((completed / activities.length) * 100)
    : 0;

  const sortedActivities = [...activities].sort((a, b) =>
    a.time.localeCompare(b.time)
  );

  const isHistory = activePage === 'history';
  const isDashboard = activePage === 'dashboard';
  const isCalendar = activePage === 'calendar';

  // Dashboard calculations
  const today = getToday();
  const totalActivities = dashboardActivities.length;

  const totalMinutes = dashboardActivities.reduce((total, activity) => {
    return total + getDuration(activity.start_time, activity.end_time);
  }, 0);

  const totalHours = (totalMinutes / 60).toFixed(1);

  const now = new Date();
  const weekDates = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    weekDates.push(getDateString(date));
  }

  const weeklyActivities = weekDates.map((date) => ({
    date,
    count: dashboardActivities.filter(
      (activity) => activity.activity_date === date
    ).length,
  }));

  const maxWeeklyCount = Math.max(
    1,
    ...weeklyActivities.map((item) => item.count)
  );

  const monthPrefix = today.slice(0, 7);

  const monthlyActivities = dashboardActivities.filter((activity) =>
    activity.activity_date?.startsWith(monthPrefix)
  );

  const monthlyCompleted = monthlyActivities.filter(
    (activity) => activity.is_completed
  ).length;

  const monthlyProgress = monthlyActivities.length
    ? Math.round((monthlyCompleted / monthlyActivities.length) * 100)
    : 0;

  const activeDays = new Set(
    dashboardActivities
      .filter((activity) => weekDates.includes(activity.activity_date))
      .map((activity) => activity.activity_date)
  ).size;

  // Learning Streak
  const activityDates = new Set(
    dashboardActivities.map((activity) => activity.activity_date)
  );

  const streakDate = new Date();
  streakDate.setHours(12, 0, 0, 0);

  if (!activityDates.has(today)) {
    streakDate.setDate(streakDate.getDate() - 1);
  }

  let learningStreak = 0;

  while (activityDates.has(getDateString(streakDate))) {
    learningStreak++;
    streakDate.setDate(streakDate.getDate() - 1);
  }

  // Learning Goals progress calculations
  const dailyGoalNumber = Number(dailyGoal) || 0;
  const weeklyGoalNumber = Number(weeklyGoal) || 0;

  const todayMinutes = dashboardActivities
    .filter((activity) => activity.activity_date === today)
    .reduce(
      (total, activity) =>
        total + getDuration(activity.start_time, activity.end_time),
      0
    );

  const weeklyMinutes = dashboardActivities
    .filter((activity) => weekDates.includes(activity.activity_date))
    .reduce(
      (total, activity) =>
        total + getDuration(activity.start_time, activity.end_time),
      0
    );

  const todayHours = todayMinutes / 60;
  const weeklyHours = weeklyMinutes / 60;

  const dailyGoalProgress =
    dailyGoalNumber > 0
      ? Math.min(100, Math.round((todayHours / dailyGoalNumber) * 100))
      : 0;

  const weeklyGoalProgress =
    weeklyGoalNumber > 0
      ? Math.min(100, Math.round((weeklyHours / weeklyGoalNumber) * 100))
      : 0;

  const categoryStats = categories
    .map((category) => {
      const categoryActivities = dashboardActivities.filter(
        (activity) => activity.category_id === category.id
      );

      return {
        name: category.name,
        count: categoryActivities.length,
      };
    })
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxCategoryCount = Math.max(
    1,
    ...categoryStats.map((category) => category.count)
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">L</div>
          <div>
            <h2>LearnFlow</h2>
            <span>Personal learning journal</span>
          </div>
        </div>

        <div className="side-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item ${
            !isHistory && !isDashboard && !isCalendar ? 'active' : ''
          }`}
          onClick={openTimetable}
        >
          ▦ &nbsp; My timetable
        </button>

        <button
          type="button"
          className={`nav-item ${isCalendar ? 'active' : ''}`}
          onClick={openCalendar}
        >
          📅 &nbsp; Learning calendar
        </button>

        <button
          type="button"
          className={`nav-item ${isHistory ? 'active' : ''}`}
          onClick={openHistory}
        >
          ▣ &nbsp; Learning history
        </button>

        <button
          type="button"
          className={`nav-item ${isDashboard ? 'active' : ''}`}
          onClick={openDashboard}
        >
          📊 &nbsp; Progress dashboard
        </button>

        <button
          type="button"
          className="nav-item category-nav-button"
          onClick={() => {
            setActivePage('timetable');
            setShowCategoryManager(!showCategoryManager);
            setShowForm(false);
            setMessage('');
          }}
        >
          ◷ &nbsp; Categories
        </button>

        <div className="sidebar-bottom">
          <div className="avatar">L</div>
          <div className="account-info">
            <strong>My Account</strong>
            <span>{session.user.email}</span>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="breadcrumb">
              Workspace /{' '}
              {isDashboard
                ? 'Progress Dashboard'
                : isHistory
                ? 'Learning History'
                : isCalendar
                ? 'Learning Calendar'
                : 'Timetable'}
            </span>

            <h1>
              {isDashboard
                ? 'My Learning Progress'
                : isHistory
                ? 'My Learning History'
                : isCalendar
                ? 'My Learning Calendar'
                : 'My Learning Day'}
            </h1>

            <p>
              {isDashboard
                ? 'Understand your learning habits and celebrate your progress.'
                : isHistory
                ? 'Look back at your learning journey and progress.'
                : isCalendar
                ? 'Explore your learning activities month by month.'
                : 'Small steps every day lead to big achievements.'}
            </p>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <div className="today-badge">✦ Personal Journal</div>
          </div>
        </header>

        {/* DASHBOARD */}
        {isDashboard ? (
          <section className="dashboard">
            {dashboardLoading || goalsLoading ? (
              <p>Loading your learning progress...</p>
            ) : (
              <>
                <div className="dashboard-stats">
                  <div className="stat-card">
                    <span>Total learning hours</span>
                    <strong>{totalHours} hrs</strong>
                    <small>Based on recorded start and end times</small>
                  </div>

                  <div className="stat-card">
                    <span>Total activities</span>
                    <strong>{totalActivities}</strong>
                    <small>All your recorded learning sessions</small>
                  </div>

                  <div className="stat-card">
                    <span>Monthly completion</span>
                    <strong>{monthlyProgress}%</strong>
                    <small>
                      {monthlyCompleted} of {monthlyActivities.length} completed
                      this month
                    </small>
                  </div>

                  <div className="stat-card">
                    <span>Learning consistency</span>
                    <strong>{activeDays}/7</strong>
                    <small>Days with learning activity this week</small>
                  </div>

                  <div className="stat-card streak-card">
                    <span>🔥 Learning streak</span>
                    <strong>
                      {learningStreak} {learningStreak === 1 ? 'day' : 'days'}
                    </strong>
                    <small>
                      {learningStreak > 0
                        ? 'Keep your learning momentum going!'
                        : 'Start your learning streak today!'}
                    </small>
                  </div>
                </div>

                {/* LEARNING GOALS */}
                <div className="dashboard-card learning-goals-card">
                  <h2>🎯 Learning Goals</h2>
                  <p>Set your targets and track your learning hours.</p>

                  <form className="learning-goals-form" onSubmit={saveGoals}>
                    <div className="learning-goal-inputs">
                      <div>
                        <label htmlFor="daily-goal">Daily goal (hours)</label>
                        <input
                          id="daily-goal"
                          type="number"
                          min="0.25"
                          max="24"
                          step="0.25"
                          value={dailyGoal}
                          onChange={(e) => setDailyGoal(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="weekly-goal">Weekly goal (hours)</label>
                        <input
                          id="weekly-goal"
                          type="number"
                          min="0.25"
                          max="168"
                          step="0.25"
                          value={weeklyGoal}
                          onChange={(e) => setWeeklyGoal(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={goalsSaving}
                    >
                      {goalsSaving ? 'Saving goals...' : 'Save learning goals'}
                    </button>
                  </form>

                  <div className="goal-progress-list">
                    <div className="goal-progress-item">
                      <div className="goal-progress-heading">
                        <strong>Today's progress</strong>
                        <span>
                          {todayHours.toFixed(1)} / {dailyGoalNumber} hours
                        </span>
                      </div>

                      <div className="goal-progress-track">
                        <div
                          className="goal-progress-fill"
                          style={{ width: `${dailyGoalProgress}%` }}
                        />
                      </div>

                      <small>
                        {dailyGoalProgress >= 100
                          ? '🎉 Daily goal achieved!'
                          : `${dailyGoalProgress}% of your daily goal completed`}
                      </small>
                    </div>

                    <div className="goal-progress-item">
                      <div className="goal-progress-heading">
                        <strong>Last 7 days' progress</strong>
                        <span>
                          {weeklyHours.toFixed(1)} / {weeklyGoalNumber} hours
                        </span>
                      </div>

                      <div className="goal-progress-track">
                        <div
                          className="goal-progress-fill weekly-goal-fill"
                          style={{ width: `${weeklyGoalProgress}%` }}
                        />
                      </div>

                      <small>
                        {weeklyGoalProgress >= 100
                          ? '🎉 Weekly goal achieved!'
                          : `${weeklyGoalProgress}% of your weekly goal completed`}
                      </small>
                    </div>
                  </div>
                </div>

                <div className="dashboard-grid">
                  <div className="dashboard-card">
                    <h2>Weekly learning activity</h2>
                    <p>Number of activities recorded each day.</p>

                    <div className="weekly-chart">
                      {weeklyActivities.map((item) => (
                        <div className="weekly-bar-item" key={item.date}>
                          <strong>{item.count}</strong>
                          <div className="weekly-bar-track">
                            <div
                              className="weekly-bar-fill"
                              style={{
                                height: `${
                                  (item.count / maxWeeklyCount) * 100
                                }%`,
                              }}
                            />
                          </div>
                          <span>
                            {new Date(
                              item.date + 'T12:00:00'
                            ).toLocaleDateString('en', { weekday: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <h2>Monthly completion</h2>
                    <p>Your completed activities this month.</p>

                    <div
                      className="completion-circle"
                      style={{
                        background: `conic-gradient(#4c88e8 ${
                          monthlyProgress * 3.6
                        }deg, #edf1f7 0deg)`,
                      }}
                    >
                      <div className="completion-circle-inner">
                        <strong>{monthlyProgress}%</strong>
                        <span>Completed</span>
                      </div>
                    </div>

                    <div className="completion-details">
                      <span>
                        Completed: <strong>{monthlyCompleted}</strong>
                      </span>
                      <span>
                        Remaining:{' '}
                        <strong>
                          {monthlyActivities.length - monthlyCompleted}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <h2>Learning by category</h2>
                    <p>Where you spend your learning time.</p>

                    {categoryStats.length > 0 ? (
                      <div className="category-progress-list">
                        {categoryStats.map((category) => (
                          <div
                            className="category-progress-item"
                            key={category.name}
                          >
                            <div className="category-progress-heading">
                              <strong>{category.name}</strong>
                              <span>{category.count} activities</span>
                            </div>

                            <div className="category-progress-track">
                              <div
                                className="category-progress-fill"
                                style={{
                                  width: `${
                                    (category.count / maxCategoryCount) * 100
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No category activities recorded yet.</p>
                    )}
                  </div>

                  <div className="dashboard-card">
                    <h2>Your learning journey</h2>
                    <p>A quick summary of your progress.</p>

                    <div className="journey-summary">
                      <div>
                        <span>Total activities</span>
                        <strong>{totalActivities}</strong>
                      </div>

                      <div>
                        <span>Completed activities</span>
                        <strong>
                          {
                            dashboardActivities.filter(
                              (activity) => activity.is_completed
                            ).length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Days active this week</span>
                        <strong>{activeDays} days</strong>
                      </div>

                      <div>
                        <span>Current learning streak</span>
                        <strong>🔥 {learningStreak} days</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : isCalendar ? (
          /* LEARNING CALENDAR */
          <section className="calendar-content">
            {dashboardLoading ? (
              <p>Loading your learning calendar...</p>
            ) : (
              <LearningCalendar
                activities={dashboardActivities}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onViewDay={openCalendarDay}
              />
            )}
          </section>
        ) : (
          <>
            {/* DAILY STATISTICS */}
            <section className="stats">
              <div className="stat-card">
                <span>
                  {isHistory ? 'Activities on this date' : "Today's activities"}
                </span>
                <strong>{activities.length}</strong>
                <small>Learning sessions</small>
              </div>

              <div className="stat-card">
                <span>Completed</span>
                <strong>{completed}</strong>
                <small>Finished learning sessions</small>
              </div>

              <div className="stat-card">
                <span>{isHistory ? 'Not completed' : 'Progress'}</span>
                <strong>{isHistory ? unfinished : `${progress}%`}</strong>

                {isHistory ? (
                  <small>Unfinished learning sessions</small>
                ) : (
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </section>

            <section className="schedule">
              <div className="schedule-header">
                <div>
                  <h2>
                    {isHistory ? 'Daily learning history' : 'Daily timetable'}
                  </h2>
                  <p>
                    {isHistory
                      ? 'Review the activities recorded on your selected date.'
                      : 'Organise your learning, one session at a time.'}
                  </p>
                </div>

                {!isHistory && (
                  <button className="primary-button" onClick={openAddForm}>
                    + Add activity
                  </button>
                )}
              </div>

              {/* Category Management */}
              {showCategoryManager && !isHistory && (
                <div className="category-manager">
                  <div className="category-manager-heading">
                    <div>
                      <h3>Manage Categories</h3>
                      <p>
                        Create and manage your personal learning categories.
                      </p>
                    </div>

                    <button
                      className="cancel-button"
                      onClick={() => setShowCategoryManager(false)}
                    >
                      Close
                    </button>
                  </div>

                  <form className="category-add-form" onSubmit={addCategory}>
                    <input
                      type="text"
                      placeholder="Enter a new category name"
                      value={newCategoryName}
                      maxLength={40}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      required
                    />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={categorySaving}
                    >
                      {categorySaving ? 'Adding...' : '+ Add category'}
                    </button>
                  </form>

                  <div className="category-list">
                    {categories.map((category) => (
                      <div className="category-list-item" key={category.id}>
                        <div>
                          <strong>{category.name}</strong>
                          <small>
                            {category.is_default
                              ? 'Default category'
                              : 'My custom category'}
                          </small>
                        </div>

                        {!category.is_default && (
                          <button
                            className="delete-button"
                            onClick={() => deleteCategory(category)}
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    ))}

                    {categories.length === 0 && <p>No categories available.</p>}
                  </div>
                </div>
              )}

              {/* Date Selection */}
              <div className="date-row">
                <div>
                  <strong>
                    {isHistory ? 'History date' : 'Selected date'}
                  </strong>
                  <span>
                    {isHistory
                      ? 'Choose a previous day to review your learning'
                      : 'Choose a day to view your journal'}
                  </span>
                </div>

                <input
                  type="date"
                  value={selectedDate}
                  max={getToday()}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setShowForm(false);
                    setMessage('');
                  }}
                />
              </div>

              {message && <p className="database-status">{message}</p>}
              {loading && <p>Loading activities...</p>}

              {/* Activity Form */}
              {showForm && !isHistory && (
                <form className="activity-form" onSubmit={saveActivity}>
                  <h3>
                    {editingId
                      ? 'Edit learning activity'
                      : 'New learning activity'}
                  </h3>

                  <label>Activity title</label>
                  <input
                    required
                    placeholder="What are you going to learn?"
                    value={newActivity.title}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, title: e.target.value })
                    }
                  />

                  <div className="form-grid">
                    <div>
                      <label>Start time</label>
                      <input
                        type="time"
                        required
                        value={newActivity.time}
                        onChange={(e) =>
                          setNewActivity({
                            ...newActivity,
                            time: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label>End time</label>
                      <input
                        type="time"
                        value={newActivity.endTime}
                        onChange={(e) =>
                          setNewActivity({
                            ...newActivity,
                            endTime: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <label>Category</label>
                  <select
                    value={newActivity.category}
                    onChange={(e) =>
                      setNewActivity({
                        ...newActivity,
                        category: e.target.value,
                      })
                    }
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <label>What do you plan to learn?</label>
                  <textarea
                    placeholder="Write your learning plan..."
                    value={newActivity.planned}
                    onChange={(e) =>
                      setNewActivity({
                        ...newActivity,
                        planned: e.target.value,
                      })
                    }
                  />

                  <label>What did you actually learn?</label>
                  <textarea
                    placeholder="Write what you learned..."
                    value={newActivity.actual}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, actual: e.target.value })
                    }
                  />

                  <div className="form-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={() => {
                        setShowForm(false);
                        setEditingId(null);
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={saving}
                    >
                      {saving
                        ? 'Saving...'
                        : editingId
                        ? 'Update activity'
                        : 'Save activity'}
                    </button>
                  </div>
                </form>
              )}

              {/* Daily Timeline and History */}
              <div className="timeline">
                {!loading &&
                  sortedActivities.map((activity) => (
                    <div className="timeline-item" key={activity.id}>
                      <div className="time">{activity.time}</div>

                      <div className="timeline-line">
                        <div
                          className={`timeline-dot ${
                            activity.completed ? 'done' : ''
                          }`}
                        />
                      </div>

                      <div className="activity-card">
                        <div className="activity-heading">
                          <div>
                            <span className="category">
                              {activity.category || 'Uncategorized'}
                            </span>
                            <h3>{activity.title}</h3>
                            {activity.endTime && (
                              <small>Ends at {activity.endTime}</small>
                            )}
                          </div>

                          <div className="activity-actions">
                            <label className="complete-label">
                              <input
                                type="checkbox"
                                checked={activity.completed}
                                onChange={() => toggleComplete(activity.id)}
                              />
                              Done
                            </label>

                            <button
                              className="edit-button"
                              onClick={() => openEditForm(activity)}
                            >
                              ✏️ Edit
                            </button>

                            <button
                              className="delete-button"
                              onClick={() => deleteActivity(activity.id)}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>

                        <div className="notes">
                          <div>
                            <strong>Planned learning</strong>
                            <p>{activity.planned || 'No plan added yet.'}</p>
                          </div>

                          <div>
                            <strong>Actual learning</strong>
                            <textarea
                              placeholder="What did you actually learn?"
                              value={activity.actual}
                              onChange={(e) =>
                                updateActual(activity.id, e.target.value)
                              }
                            />
                          </div>
                        </div>

                        {/* LEARNING MATERIALS */}
                        <ActivityMaterials
                          activityId={activity.id}
                          userId={session.user.id}
                        />
                      </div>
                    </div>
                  ))}

                {!loading && activities.length === 0 && (
                  <div className="empty-state">
                    <div>{isHistory ? '📖' : '📚'}</div>
                    <h3>
                      {isHistory
                        ? 'No learning history for this date'
                        : 'Your learning journey starts here'}
                    </h3>
                    <p>
                      {isHistory
                        ? 'Choose another date to review your previous activities.'
                        : 'No activities for this date yet. Add your first one!'}
                    </p>

                    {isHistory && (
                      <button className="cancel-button" onClick={openTimetable}>
                        Back to timetable
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        <footer>LearnFlow · Make every learning day count.</footer>
      </main>
    </div>
  );
}

export default App;
