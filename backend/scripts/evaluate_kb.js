// @ts-check
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { ingestHandbook, queryKnowledgeBase } = require('../src/services/handbook_service');

const EVAL_QUESTIONS = [
  // ---------------------------------------------------------------------------
  // 20 IN-DOMAIN QUESTIONS (Explicitly documented in sample_fictional_handbook.md)
  // ---------------------------------------------------------------------------
  {
    id: 1,
    type: 'in_domain',
    query: "What are the regular academic instructional hours on weekdays?",
    expected_citation_fragment: "§1.1"
  },
  {
    id: 2,
    type: 'in_domain',
    query: "What is the minimum attendance percentage required to appear in semester exams?",
    expected_citation_fragment: "§1.1"
  },
  {
    id: 3,
    type: 'in_domain',
    query: "Who must a student contact for academic timetable clashes or attendance queries?",
    expected_citation_fragment: "§1.1"
  },
  {
    id: 4,
    type: 'in_domain',
    query: "What are the opening and closing hours for the Central Library on weekdays?",
    expected_citation_fragment: "§1.2"
  },
  {
    id: 5,
    type: 'in_domain',
    query: "What are the operating hours for the Central Library on Saturdays and Sundays?",
    expected_citation_fragment: "§1.2"
  },
  {
    id: 6,
    type: 'in_domain',
    query: "How many books can an undergraduate student borrow from the library simultaneously?",
    expected_citation_fragment: "§1.2"
  },
  {
    id: 7,
    type: 'in_domain',
    query: "What is the late return fine per day per book in the library?",
    expected_citation_fragment: "§1.2"
  },
  {
    id: 8,
    type: 'in_domain',
    query: "At what time is the mandatory daily hostel curfew enforced?",
    expected_citation_fragment: "§2.1"
  },
  {
    id: 9,
    type: 'in_domain',
    query: "When is the evening biometric roll call conducted in the hostels?",
    expected_citation_fragment: "§2.1"
  },
  {
    id: 10,
    type: 'in_domain',
    query: "What disciplinary category is unauthorized presence outside the hostel after 9:30 PM?",
    expected_citation_fragment: "§2.1"
  },
  {
    id: 11,
    type: 'in_domain',
    query: "How does a student submit an overnight outpass request?",
    expected_citation_fragment: "§2.2"
  },
  {
    id: 12,
    type: 'in_domain',
    query: "What automated voice verification occurs when an outpass request is submitted?",
    expected_citation_fragment: "§2.2"
  },
  {
    id: 13,
    type: 'in_domain',
    query: "Who has the final human authority to approve or reject an outpass?",
    expected_citation_fragment: "§2.2"
  },
  {
    id: 14,
    type: 'in_domain',
    query: "What is the turnaround SLA for emergency facilities defects like electrical hazards or water failure?",
    expected_citation_fragment: "§3.1"
  },
  {
    id: 15,
    type: 'in_domain',
    query: "What is the resolution SLA for medium urgency issues like lighting failure or fan malfunction?",
    expected_citation_fragment: "§3.1"
  },
  {
    id: 16,
    type: 'in_domain',
    query: "What is the turnaround time for low urgency maintenance requests like furniture repair?",
    expected_citation_fragment: "§3.1"
  },
  {
    id: 17,
    type: 'in_domain',
    query: "What is the official SSID name of the campus Wi-Fi network?",
    expected_citation_fragment: "§3.2"
  },
  {
    id: 18,
    type: 'in_domain',
    query: "What actions and penalties are taken in case of proven ragging violations?",
    expected_citation_fragment: "§4.1"
  },
  {
    id: 19,
    type: 'in_domain',
    query: "What is the review timeframe for confidential student grievances?",
    expected_citation_fragment: "§4.2"
  },
  {
    id: 20,
    type: 'in_domain',
    query: "Where is the emergency life-support ambulance stationed on campus?",
    expected_citation_fragment: "§5.1"
  },

  // ---------------------------------------------------------------------------
  // 10 OUT-OF-DOMAIN QUESTIONS (Not in handbook - Must trigger honest fallback)
  // ---------------------------------------------------------------------------
  {
    id: 21,
    type: 'out_of_domain',
    query: "What are the timings and booking charges for the Olympic swimming pool?",
    expected_citation_fragment: null
  },
  {
    id: 22,
    type: 'out_of_domain',
    query: "Can students park private helicopters on the football ground?",
    expected_citation_fragment: null
  },
  {
    id: 23,
    type: 'out_of_domain',
    query: "What is the daily parking fee for sports cars in the student lot?",
    expected_citation_fragment: null
  },
  {
    id: 24,
    type: 'out_of_domain',
    query: "What is the weekly menu for the Japanese sushi station in the cafeteria?",
    expected_citation_fragment: null
  },
  {
    id: 25,
    type: 'out_of_domain',
    query: "Can students mine cryptocurrency using hostel server power?",
    expected_citation_fragment: null
  },
  {
    id: 26,
    type: 'out_of_domain',
    query: "How do I claim a full tuition refund if I fail my mid-term examinations?",
    expected_citation_fragment: null
  },
  {
    id: 27,
    type: 'out_of_domain',
    query: "Where can I purchase tickets for the international rock music festival?",
    expected_citation_fragment: null
  },
  {
    id: 28,
    type: 'out_of_domain',
    query: "What are the rules for adopting pet chimpanzees in hostel rooms?",
    expected_citation_fragment: null
  },
  {
    id: 29,
    type: 'out_of_domain',
    query: "How do I apply for commercial drone delivery permissions to dorm balconies?",
    expected_citation_fragment: null
  },
  {
    id: 30,
    type: 'out_of_domain',
    query: "What is the campus bookstore policy on selling vintage comic books?",
    expected_citation_fragment: null
  }
];

async function runEvaluation() {
  console.log('📚 [Knowledge Base Evaluation] Ingesting realistic handbook...');
  const tenantId = 'a0000000-0000-0000-0000-000000000001';
  const handbookPath = path.resolve(__dirname, '../../data/sample_fictional_handbook.md');
  const handbookContent = fs.readFileSync(handbookPath, 'utf8');

  await ingestHandbook({
    tenantId,
    title: 'Oakwood Institute Official Student Handbook 2026-2027',
    filename: 'sample_fictional_handbook.md',
    content: handbookContent
  });
  console.log('✅ Handbook ingested and chunks indexed.\n');

  console.log('🔬 Evaluating 30 test questions (20 in-domain, 10 out-of-domain)...');
  
  let hits = 0;
  let wrongAnswers = 0;
  let dontKnows = 0;
  const results = [];

  for (const item of EVAL_QUESTIONS) {
    const res = await queryKnowledgeBase({ tenantId, query: item.query });

    let outcome;
    if (item.type === 'in_domain') {
      if (res.is_grounded && res.citation && res.citation.includes(item.expected_citation_fragment)) {
        outcome = 'HIT';
        hits++;
      } else if (res.is_grounded) {
        outcome = 'WRONG_ANSWER';
        wrongAnswers++;
      } else {
        outcome = 'DONT_KNOW';
        dontKnows++;
      }
    } else {
      // Out of domain: should NOT be grounded
      if (!res.is_grounded) {
        outcome = 'CORRECT_DONT_KNOW';
        dontKnows++;
      } else {
        outcome = 'WRONG_ANSWER_HALLUCINATION';
        wrongAnswers++;
      }
    }

    results.push({
      id: item.id,
      type: item.type,
      query: item.query,
      outcome,
      is_grounded: res.is_grounded,
      citation: res.citation || null,
      confidence: res.confidence,
      source_type: res.source_type,
      latency_ms: res.latency_ms
    });
  }

  const total = EVAL_QUESTIONS.length;
  const hitRate = parseFloat(((hits / total) * 100).toFixed(1));
  const wrongRate = parseFloat(((wrongAnswers / total) * 100).toFixed(1));
  const dontKnowRate = parseFloat(((dontKnows / total) * 100).toFixed(1));

  // Compute domain-specific metrics
  const inDomainTotal = EVAL_QUESTIONS.filter(q => q.type === 'in_domain').length;
  const outDomainTotal = EVAL_QUESTIONS.filter(q => q.type === 'out_of_domain').length;
  const inDomainHitRate = parseFloat(((hits / inDomainTotal) * 100).toFixed(1));
  const outDomainRejectRate = parseFloat((((dontKnows - (inDomainTotal - hits)) / outDomainTotal) * 100).toFixed(1));

  console.log('================================================================');
  console.log('🎯 30-QUESTION KNOWLEDGE BASE BENCHMARK REPORT:');
  console.log(`   - Total Questions:          ${total}`);
  console.log(`   - Hit Rate (Overall):       ${hitRate}% (${hits}/${total})`);
  console.log(`   - In-Domain Hit Rate:       ${inDomainHitRate}% (${hits}/${inDomainTotal})`);
  console.log(`   - Out-of-Domain Rejection:  ${outDomainRejectRate}% (Correctly fell back to dept referral)`);
  console.log(`   - Wrong-Answer Rate:        ${wrongRate}% (${wrongAnswers}/${total})`);
  console.log(`   - "I don't know" Rate:      ${dontKnowRate}% (${dontKnows}/${total})`);
  console.log('================================================================\n');

  const reportOut = {
    timestamp: new Date().toISOString(),
    metrics: {
      total_questions: total,
      hits,
      wrong_answers: wrongAnswers,
      dont_know_count: dontKnows,
      hit_rate_pct: hitRate,
      wrong_answer_rate_pct: wrongRate,
      dont_know_rate_pct: dontKnowRate,
      in_domain_accuracy_pct: inDomainHitRate,
      out_of_domain_abstention_pct: outDomainRejectRate
    },
    questions: results
  };

  const outPath = path.resolve(__dirname, '../../docs/kb_30q_evaluation_report.json');
  fs.writeFileSync(outPath, JSON.stringify(reportOut, null, 2));
  console.log(`📄 Saved detailed evaluation log to: ${outPath}`);

  return reportOut;
}

if (require.main === module) {
  runEvaluation()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('KB evaluation failed:', err);
      process.exit(1);
    });
}

module.exports = { runEvaluation, EVAL_QUESTIONS };
