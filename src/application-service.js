import { AppError, missing, forbidden, invalidState } from './errors.js';

const alreadyApplied = () => new AppError(409, 'ALREADY_APPLIED', '이미 이 행사에 신청한 기록이 있습니다.');
const capacityFull = () => new AppError(409, 'CAPACITY_FULL', '정원이 가득 찼습니다.');

export function createApplicationService(repo) {
  const db = repo.db;

  // 트랜잭션 경계: BEGIN IMMEDIATE로 쓰기 잠금을 잡은 뒤 검사·저장·이력을 한 묶음으로 처리.
  // fn이 예외를 던지면(AppError 거부, SQLite 저장 오류 모두) ROLLBACK 후 그대로 다시 던진다.
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    let result;
    try {
      result = fn();
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* 이미 종료된 경우 무시 */ }
      throw e;
    }
    return result;
  }

  // 같은 행사 PENDING 중 created_at ASC, id ASC 첫 1건.
  function nextWaiting(eventId) {
    const row = db.prepare(
      "SELECT id FROM applications WHERE event_id=? AND status='PENDING' ORDER BY created_at ASC, id ASC LIMIT 1"
    ).get(eventId);
    return row ? repo.application(row.id) : null;
  }

  const isManagerOf = (actor, event) => actor.role === 'MANAGER' && event.managerId === actor.id;

  return {
    apply(actor, eventId) {
      return transaction(() => {
        const event = repo.event(eventId);
        if (!event) throw missing('행사');
        if (actor.role !== 'STUDENT') throw forbidden();
        if (repo.existing(eventId, actor.id)) throw alreadyApplied(); // CANCELLED·REVOKED 포함
        let app;
        try {
          app = repo.insert(eventId, actor.id);
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) throw alreadyApplied(); // 최종 중복 방어
          throw e;
        }
        repo.addHistory({ applicationId: app.id, actorId: actor.id, action: 'APPLY', fromStatus: null, toStatus: 'PENDING' });
        return app;
      });
    },

    cancel(actor, applicationId) {
      return transaction(() => {
        const app = repo.application(applicationId);
        if (!app) throw missing('신청');
        if (actor.role !== 'STUDENT' || app.userId !== actor.id) throw forbidden();
        if (app.status !== 'PENDING') throw invalidState();
        const updated = repo.setStatus(app.id, 'CANCELLED'); // 승인 자리를 비우지 않으므로 자동 승급 없음
        repo.addHistory({ applicationId: app.id, actorId: actor.id, action: 'CANCEL', fromStatus: 'PENDING', toStatus: 'CANCELLED' });
        return updated;
      });
    },

    approve(actor, applicationId) {
      return transaction(() => {
        const app = repo.application(applicationId);
        if (!app) throw missing('신청');
        const event = repo.event(app.eventId);
        if (!isManagerOf(actor, event)) throw forbidden();
        if (app.status !== 'PENDING') throw invalidState();
        if (repo.approvedCount(app.eventId) >= event.capacity) throw capacityFull();
        const updated = repo.setStatus(app.id, 'APPROVED');
        repo.addHistory({ applicationId: app.id, actorId: actor.id, action: 'APPROVE', fromStatus: 'PENDING', toStatus: 'APPROVED' });
        return updated;
      });
    },

    revoke(actor, applicationId, reason) {
      return transaction(() => {
        const app = repo.application(applicationId);
        if (!app) throw missing('신청');
        const event = repo.event(app.eventId);
        if (!isManagerOf(actor, event)) throw forbidden();
        if (app.status !== 'APPROVED') throw invalidState();

        // 1) 승인 취소 + REVOKE 이력
        const revoked = repo.setStatus(app.id, 'REVOKED');
        const revokeHistoryId = repo.addHistory({
          applicationId: app.id, actorId: actor.id, action: 'REVOKE',
          fromStatus: 'APPROVED', toStatus: 'REVOKED', reason: String(reason).trim()
        });

        // 2) 자동 승급(최대 1명) + AUTO_APPROVE 이력(원인 = REVOKE 이력)
        let promoted = null;
        const next = nextWaiting(app.eventId);
        if (next) {
          promoted = repo.setStatus(next.id, 'APPROVED');
          repo.addHistory({
            applicationId: next.id, actorId: actor.id, action: 'AUTO_APPROVE',
            fromStatus: 'PENDING', toStatus: 'APPROVED', causeHistoryId: revokeHistoryId
          });
        }
        return { revoked, promoted };
      });
    }
  };
}
