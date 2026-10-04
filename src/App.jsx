import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Film,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'

const START_DAY = 15
const END_DAY = 30
const EVENT_YEAR = 2026
const STORAGE_KEY = 'mostra-sp-board-v1'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

const days = Array.from({ length: END_DAY - START_DAY + 1 }, (_, index) => {
  const date = new Date(Date.UTC(EVENT_YEAR, 9, START_DAY + index, 12))
  return {
    id: `2026-10-${String(START_DAY + index).padStart(2, '0')}`,
    day: String(START_DAY + index).padStart(2, '0'),
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
      .format(date)
      .replace('.', ''),
  }
})

function emptyBoard() {
  return { films: [], schedule: Object.fromEntries(days.map(({ id }) => [id, []])) }
}

function readBoard() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved && Array.isArray(saved.films) && saved.schedule) {
      return {
        films: saved.films,
        schedule: Object.fromEntries(days.map(({ id }) => [id, saved.schedule[id] || []])),
      }
    }
  } catch {
    // A malformed local snapshot should not prevent starting a fresh board.
  }
  return emptyBoard()
}

function makeId() {
  return crypto.randomUUID()
}

function filmIdentity(film) {
  if (film.originId) return film.originId
  const details = [film.title, film.director, film.country, film.duration]
    .map((value) => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  return `legacy:${details.join('|')}`
}

function copyFilm(film) {
  return { ...film, id: makeId(), originId: filmIdentity(film) }
}

function App() {
  const [board, setBoard] = useState(readBoard)
  const [filter, setFilter] = useState('')
  const [editor, setEditor] = useState(null)
  const [cloudOpen, setCloudOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState('Salvo neste aparelho')
  const [authMessage, setAuthMessage] = useState('')
  const [collapsedColumns, setCollapsedColumns] = useState({})
  const [showScrollTop, setShowScrollTop] = useState(false)
  const boardRef = useRef(board)

  const scheduledCount = days.reduce(
    (total, { id }) => total + board.schedule[id].length,
    0,
  )
  const scheduledDaysByFilm = new Map()
  for (const { id } of days) {
    for (const film of board.schedule[id]) {
      const identity = filmIdentity(film)
      const filmDays = scheduledDaysByFilm.get(identity) || new Set()
      filmDays.add(id)
      scheduledDaysByFilm.set(identity, filmDays)
    }
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
    boardRef.current = board
  }, [board])

  useEffect(() => {
    const updateScrollButton = () => setShowScrollTop(window.scrollY > 360)
    window.addEventListener('scroll', updateScrollButton, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollButton)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      if (!session) {
        setCloudReady(false)
        setCloudStatus('Salvo neste aparelho')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !user) return undefined
    let active = true

    async function restoreBoard() {
      setCloudStatus('Carregando nuvem...')
      const { data, error } = await supabase
        .from('mostra_boards')
        .select('board')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return
      if (error) {
        setCloudStatus('Nuvem indisponível; salvo neste aparelho')
        return
      }
      if (data?.board && Array.isArray(data.board.films) && data.board.schedule) {
        setBoard({
          films: data.board.films,
          schedule: Object.fromEntries(
            days.map(({ id }) => [id, data.board.schedule[id] || []]),
          ),
        })
      } else {
        const { error: saveError } = await supabase.from('mostra_boards').upsert(
          { user_id: user.id, board: boardRef.current },
          { onConflict: 'user_id' },
        )
        if (saveError) {
          setCloudStatus('Nuvem indisponível; salvo neste aparelho')
          return
        }
      }
      setCloudReady(true)
      setCloudStatus('Sincronizado')
    }

    restoreBoard()
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!supabase || !user || !cloudReady) return undefined
    const timeout = window.setTimeout(async () => {
      setCloudStatus('Salvando...')
      const { error } = await supabase.from('mostra_boards').upsert(
        { user_id: user.id, board, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      setCloudStatus(error ? 'Erro na nuvem; salvo neste aparelho' : 'Sincronizado')
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [board, cloudReady, user])

  useEffect(() => {
    if (!supabase || !user || !cloudReady) return undefined
    const channel = supabase
      .channel(`mostra-board-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mostra_boards',
          filter: `user_id=eq.${user.id}`,
        },
        ({ new: record }) => {
          const remoteBoard = record.board
          if (!Array.isArray(remoteBoard?.films) || !remoteBoard.schedule) return
          if (JSON.stringify(remoteBoard) === JSON.stringify(boardRef.current)) return
          setBoard({
            films: remoteBoard.films,
            schedule: Object.fromEntries(
              days.map(({ id }) => [id, remoteBoard.schedule[id] || []]),
            ),
          })
          setCloudStatus('Atualizado de outro aparelho')
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [cloudReady, user])

  function updateFilm(columnId, filmId, changes) {
    setBoard((current) => {
      if (columnId === 'library') {
        return {
          ...current,
          films: current.films.map((film) => film.id === filmId ? { ...film, ...changes } : film),
        }
      }
      return {
        ...current,
        schedule: {
          ...current.schedule,
          [columnId]: current.schedule[columnId].map((film) =>
            film.id === filmId ? { ...film, ...changes } : film,
          ),
        },
      }
    })
  }

  function saveFilm(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const id = editor.film?.id || makeId()
    const film = {
      id,
      originId: editor.film ? filmIdentity(editor.film) : id,
      title: values.get('title').trim(),
      director: values.get('director').trim(),
      country: values.get('country').trim(),
      duration: values.get('duration').trim(),
      notes: values.get('notes').trim(),
    }
    if (editor.film) {
      updateFilm(editor.columnId, editor.film.id, film)
    } else {
      setBoard((current) => ({ ...current, films: [film, ...current.films] }))
    }
    setEditor(null)
  }

  function removeFilm(columnId, filmId) {
    const confirmed = window.confirm('Remover este card da programação?')
    if (!confirmed) return
    if (columnId === 'library') {
      setBoard((current) => ({
        ...current,
        films: current.films.filter((film) => film.id !== filmId),
      }))
      return
    }
    setBoard((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [columnId]: current.schedule[columnId].filter((film) => film.id !== filmId),
      },
    }))
  }

  function duplicateTo(film, dayId) {
    setBoard((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [dayId]: [...current.schedule[dayId], copyFilm(film)],
      },
    }))
  }

  function toggleColumn(columnId) {
    setCollapsedColumns((current) => ({
      ...current,
      [columnId]: !current[columnId],
    }))
  }

  function handleDrop(event, targetId) {
    event.preventDefault()
    const draggedFilm = event.dataTransfer.getData('application/mostra-film')
    if (!draggedFilm) return
    let payload
    try {
      payload = JSON.parse(draggedFilm)
    } catch {
      return
    }
    if (!payload.columnId || !payload.filmId) return
    if (payload.columnId === targetId) return
    const film = payload.columnId === 'library'
      ? board.films.find((item) => item.id === payload.filmId)
      : board.schedule[payload.columnId]?.find((item) => item.id === payload.filmId)
    if (!film) return

    if (payload.columnId === 'library') {
      duplicateTo(film, targetId)
      return
    }
    setBoard((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [payload.columnId]: current.schedule[payload.columnId].filter(
          (item) => item.id !== payload.filmId,
        ),
        [targetId]: [...current.schedule[targetId], film],
      },
    }))
  }

  async function submitAuth(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const email = values.get('email')
    const password = values.get('password')
    setAuthMessage('')
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (result.error) {
      setAuthMessage(result.error.message)
    } else if (authMode === 'signup' && !result.data.session) {
      setAuthMessage('Confira seu e-mail para confirmar a conta e depois entre.')
    } else {
      setAuthMessage('Conta conectada. Carregando sua programação...')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setCloudOpen(false)
  }

  const filteredFilms = (films) => films.filter((film) =>
    `${film.title} ${film.director} ${film.country}`.toLocaleLowerCase('pt-BR')
      .includes(filter.toLocaleLowerCase('pt-BR')),
  )

  function renderCard(film, columnId) {
    const scheduledDays = scheduledDaysByFilm.get(filmIdentity(film))
    const cardState = scheduledDays?.size > 1
      ? 'film-card--multi-day'
      : columnId === 'library' && scheduledDays?.size === 1
        ? 'film-card--planned'
        : ''
    return (
      <article
        className={`film-card ${cardState}`}
        key={film.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = columnId === 'library' ? 'copy' : 'move'
          event.dataTransfer.setData(
            'application/mostra-film',
            JSON.stringify({ columnId, filmId: film.id }),
          )
        }}
      >
        <div className="film-card__top">
          <span className="film-card__mark"><Film size={15} strokeWidth={1.8} /></span>
          <div className="film-card__actions">
            <details className="copy-menu">
              <summary aria-label="Duplicar para outra data" title="Duplicar para outra data">
                <Copy size={15} />
              </summary>
              <div className="copy-menu__panel">
                <span>Duplicar para</span>
                {days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={(event) => {
                      duplicateTo(film, day.id)
                      event.currentTarget.closest('details').open = false
                    }}
                  >
                    {day.day} out. <small>{day.weekday}</small>
                  </button>
                ))}
              </div>
            </details>
            <button
              type="button"
              className="icon-button"
              aria-label={`Editar ${film.title}`}
              title="Editar filme"
              onClick={() => setEditor({ columnId, film })}
            ><Pencil size={15} /></button>
            <button
              type="button"
              className="icon-button icon-button--quiet"
              aria-label={`Remover ${film.title}`}
              title="Remover card"
              onClick={() => removeFilm(columnId, film.id)}
            ><Trash2 size={15} /></button>
          </div>
        </div>
        <h3>{film.title}</h3>
        {(film.director || film.country || film.duration) && (
          <div className="film-card__meta">
            {film.director && <span>{film.director}</span>}
            {(film.country || film.duration) && (
              <span>{[film.country, film.duration && `${film.duration} min`].filter(Boolean).join(' · ')}</span>
            )}
          </div>
        )}
        {film.notes && <p className="film-card__notes">{film.notes}</p>}
        {columnId === 'library' && (
          <div className="film-card__footer"><span>Na lista de filmes</span><ChevronDown size={13} /></div>
        )}
      </article>
    )
  }

  function renderColumn({ id, day, weekday }) {
    const films = filteredFilms(board.schedule[id])
    const collapsed = Boolean(collapsedColumns[id])
    return (
      <section
        className="board-column day-column"
        key={id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(event, id)}
      >
        <header className="column-heading">
          <div className="column-heading__date">
            <span className="column-heading__day">{day}</span>
            <div><span className="column-heading__month">outubro</span><span className="column-heading__weekday">{weekday}</span></div>
          </div>
          <div className="column-heading__actions">
            <span className="column-count">{board.schedule[id].length}</span>
            <button
              type="button"
              className="icon-button column-toggle"
              aria-label={`${collapsed ? 'Expandir' : 'Minimizar'} coluna ${day} de outubro`}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expandir coluna' : 'Minimizar coluna'}
              onClick={() => toggleColumn(id)}
            ><ChevronDown size={16} className={collapsed ? 'is-collapsed' : ''} /></button>
          </div>
        </header>
        {!collapsed && (
          <div className="column-cards">
            {films.map((film) => renderCard(film, id))}
            {board.schedule[id].length === 0 && (
              <div className="drop-hint"><CalendarDays size={17} /><span>Solte um filme aqui</span></div>
            )}
          </div>
        )}
      </section>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Mostra SP, início">
          <span className="brand__icon"><Clapperboard size={19} strokeWidth={1.8} /></span>
          <span className="brand__name">mostra<span>sp</span></span>
        </a>
        <div className="topbar__event"><span className="live-dot" /> MOSTRA INTERNACIONAL DE CINEMA</div>
        <button type="button" className="sync-button" onClick={() => setCloudOpen(true)}>
          {user ? <Cloud size={16} /> : supabase ? <CloudOff size={16} /> : <Settings2 size={16} />}
          <span>{user ? cloudStatus : 'Sincronização'}</span>
        </button>
      </header>

      <section className="intro" id="top">
        <div className="intro__copy">
          <p className="eyebrow">SÃO PAULO <span>/</span> 15 — 30 OUT 2026</p>
          <h1>Sua mostra,<br /><em>seu roteiro.</em></h1>
          <p className="intro__description">Uma programação em construção. Guarde os filmes, experimente os dias, mude de ideia.</p>
        </div>
        <div className="intro__stats" aria-label="Resumo da programação">
          <div><strong>{board.films.length.toString().padStart(2, '0')}</strong><span>filmes na lista</span></div>
          <i />
          <div><strong>{scheduledCount.toString().padStart(2, '0')}</strong><span>sessões montadas</span></div>
          <span className="ticket-stub"><Clapperboard size={25} /><small>SP<br />26</small></span>
        </div>
      </section>

      <section className="board-toolbar">
        <div className="board-toolbar__title"><h2>Programação</h2><span>arraste, duplique, experimente</span></div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Buscar filmes"
            placeholder="Buscar filme..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {filter && <button type="button" aria-label="Limpar busca" onClick={() => setFilter('')}><X size={14} /></button>}
        </label>
      </section>

      <div className="board-layout" aria-label="Quadro de programação">
        <section
          className="board-column library-column"
          onDragOver={(event) => event.preventDefault()}
        >
          <header className="column-heading library-heading">
            <div className="library-heading__label"><span className="library-heading__icon"><Film size={17} /></span><div><strong>Filmes</strong><small>lista para assistir</small></div></div>
            <div className="column-heading__actions">
              <span className="column-count">{board.films.length}</span>
              <button
                type="button"
                className="icon-button column-toggle"
                aria-label={`${collapsedColumns.library ? 'Expandir' : 'Minimizar'} lista de filmes`}
                aria-expanded={!collapsedColumns.library}
                title={collapsedColumns.library ? 'Expandir lista' : 'Minimizar lista'}
                onClick={() => toggleColumn('library')}
              ><ChevronDown size={16} className={collapsedColumns.library ? 'is-collapsed' : ''} /></button>
            </div>
          </header>
          <button type="button" className="add-film" onClick={() => setEditor({ columnId: 'library' })}>
            <Plus size={16} /> Adicionar filme
          </button>
          {!collapsedColumns.library && (
            <div className="column-cards library-cards">
              {filteredFilms(board.films).map((film) => renderCard(film, 'library'))}
              {board.films.length === 0 && (
                <div className="library-empty"><span className="empty-reel"><Film size={22} /></span><strong>Comece por um filme</strong><p>Adicione um título à sua lista. Depois, duplique para os dias que está considerando.</p></div>
              )}
            </div>
          )}
        </section>
        <div className="day-columns">
          {days.map(renderColumn)}
        </div>
      </div>

      <footer className="board-footer">
        <span><span className="footer-dot" />{user ? `Sincronizado com ${user.email}` : 'Salvo automaticamente neste aparelho'}</span>
        <span><Clock3 size={14} /> 15 a 30 de outubro</span>
      </footer>

      {showScrollTop && (
        <button
          type="button"
          className="scroll-top-button"
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        ><ArrowUp size={19} /></button>
      )}

      {editor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null) }}>
          <form className="edit-modal" onSubmit={saveFilm}>
            <div className="modal-heading"><div><span className="eyebrow">SUA LISTA DE FILMES</span><h2>{editor.film ? 'Editar filme' : 'Novo filme'}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setEditor(null)}><X size={19} /></button></div>
            <label className="form-field"><span>Título <b>*</b></span><input name="title" autoFocus required maxLength="100" defaultValue={editor.film?.title || ''} placeholder="Nome do filme" /></label>
            <div className="form-row"><label className="form-field"><span>Direção</span><input name="director" maxLength="70" defaultValue={editor.film?.director || ''} placeholder="Diretor(a)" /></label><label className="form-field"><span>País</span><input name="country" maxLength="50" defaultValue={editor.film?.country || ''} placeholder="Origem" /></label></div>
            <label className="form-field form-field--short"><span>Duração <small>em minutos</small></span><input name="duration" inputMode="numeric" pattern="[0-9]*" maxLength="3" defaultValue={editor.film?.duration || ''} placeholder="120" /></label>
            <label className="form-field"><span>Anotações</span><textarea name="notes" rows="3" maxLength="240" defaultValue={editor.film?.notes || ''} placeholder="Sinopse, sala, horário, impressão..." /></label>
            <div className="modal-actions"><button type="button" className="button-plain" onClick={() => setEditor(null)}>Cancelar</button><button type="submit" className="button-primary"><Check size={16} /> {editor.film ? 'Salvar alterações' : 'Adicionar filme'}</button></div>
          </form>
        </div>
      )}

      {cloudOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCloudOpen(false) }}>
          <section className="edit-modal cloud-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-title">
            <div className="modal-heading"><div><span className="eyebrow">SEUS DADOS</span><h2 id="cloud-title">{user ? 'Sincronização ativa' : 'Leve sua mostra'}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setCloudOpen(false)}><X size={19} /></button></div>
            {!SUPABASE_URL || !SUPABASE_ANON_KEY ? (
              <>
                <div className="cloud-note"><Cloud size={20} /><p>Por enquanto, sua programação fica salva neste aparelho. Para sincronizar com celular e desktop, conecte um projeto Supabase gratuito.</p></div>
                <ol className="setup-steps"><li>Crie um projeto gratuito em <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>Copie <code>.env.example</code> para <code>.env.local</code> e preencha a URL e a chave pública do projeto.</li><li>Execute o SQL descrito no <code>README.md</code> e reinicie o app.</li></ol>
                <p className="cloud-footnote">A chave pública é usada no navegador com políticas de acesso por conta. Nunca coloque uma chave service_role aqui.</p>
              </>
            ) : user ? (
              <>
                <div className="cloud-note cloud-note--connected"><Check size={20} /><p>Conectado como <strong>{user.email}</strong>. Alterações são sincronizadas automaticamente.</p></div>
                <div className="modal-actions"><span className="sync-state"><span className="footer-dot" />{cloudStatus}</span><button type="button" className="button-plain" onClick={signOut}>Desconectar</button></div>
              </>
            ) : (
              <>
                <p className="cloud-intro">Entre com a mesma conta em cada dispositivo. Seus filmes e sessões ficam sincronizados.</p>
                <form className="auth-form" onSubmit={submitAuth}>
                  <label className="form-field"><span>E-mail</span><input type="email" name="email" autoComplete="email" required /></label>
                  <label className="form-field"><span>Senha</span><input type="password" name="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="6" required /></label>
                  {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
                  <button type="submit" className="button-primary"><Cloud size={16} />{authMode === 'login' ? 'Entrar e sincronizar' : 'Criar conta'}</button>
                </form>
                <button type="button" className="auth-toggle" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthMessage('') }}>
                  {authMode === 'login' ? 'Ainda não tem conta? Criar uma' : 'Já tem conta? Entrar'}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App