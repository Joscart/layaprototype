import unittest
from unittest.mock import patch
from xml.etree.ElementTree import fromstring

from fastapi import HTTPException

from app.core import DecisionRequest, build_state, decide, infer


DEFAULTS = {
    "company": "default",
    "rules": "Revisar los pagos documentados",
    "instruction_decision": "¿Se recomienda aprobar este crédito?",
    "instruction_rank": "¿Cuál es el nivel de riesgo crediticio?",
    "options": ["aprobar", "revision_manual", "rechazar"],
    "rank_limits": ["bajo", "medio", "alto"],
}


class DecisionContractTests(unittest.IsolatedAsyncioTestCase):
    def test_xml_state_escapes_input(self):
        state = build_state('saldo < 100 y verificado', 'pagado <tarde> y vigente')
        root = fromstring(state)
        self.assertEqual(root.tag, 'estado_crediticio')
        self.assertEqual(root.findtext('reglas'), 'saldo < 100 y verificado')
        self.assertEqual(root.findtext('historial'), 'pagado <tarde> y vigente')

    def test_inference_is_pinned_to_spanish_multilingual_checkpoint(self):
        class RouterStub:
            def predict(self, state, questions, **kwargs):
                self.received = kwargs
                return {"answers": {}}

        router = RouterStub()
        with patch('app.core.get_router', return_value=router):
            infer('Historial de pagos puntual', {"decision": {}})
        self.assertEqual(router.received['model'], 'multilingual')
        self.assertEqual(router.received['lang'], 'es')
        self.assertEqual(router.received['max_len'], 8192)

    async def test_direct_state_wins_and_model_output_is_unchanged(self):
        model_output = {"answers": {"decision": {"choice": "revision_manual"}}, "usage": {"input_tokens": 21}}
        captured = {}

        def fake_infer(state, questions):
            captured.update(state=state, questions=questions)
            return model_output

        async def no_telemetry(_):
            return None

        async def defaults(_):
            return DEFAULTS

        with patch('app.core.webui_get_defaults', defaults), patch('app.core.infer', fake_infer), patch('app.core.send_telemetry', no_telemetry):
            result = await decide(DecisionRequest(state='Datos directos del solicitante', history='Ignorado en la inferencia', output='decision'))
        self.assertIs(result, model_output)
        self.assertEqual(captured['state'], 'Datos directos del solicitante')
        self.assertEqual(list(captured['questions']), ['decision'])
        self.assertEqual(captured['questions']['decision']['criteria']['revision_manual'], 'revisión manual')
        self.assertEqual(captured['questions']['decision']['instructions'], DEFAULTS['instruction_decision'])

    async def test_request_instruction_overrides_company_default(self):
        captured = {}

        async def defaults(_):
            return DEFAULTS

        async def no_telemetry(_):
            return None

        def fake_infer(_state, questions):
            captured.update(questions)
            return {"answers": {}, "usage": {"input_tokens": 1}}

        with patch('app.core.webui_get_defaults', defaults), patch('app.core.infer', fake_infer), patch('app.core.send_telemetry', no_telemetry):
            await decide(DecisionRequest(state='Historial puntual', instruction_decision='¿Se aprueba?', output='both'))
        self.assertEqual(captured['decision']['instructions'], '¿Se aprueba?')
        self.assertEqual(captured['rank']['instructions'], DEFAULTS['instruction_rank'])

    async def test_company_instruction_limit_is_enforced(self):
        async def defaults(_):
            return {**DEFAULTS, "instruction_decision": 'x' * 251}

        async def no_telemetry(_):
            return None

        with patch('app.core.webui_get_defaults', defaults), patch('app.core.send_telemetry', no_telemetry):
            with self.assertRaises(HTTPException) as caught:
                await decide(DecisionRequest(state='Historial puntual', output='decision'))
        self.assertEqual(caught.exception.status_code, 422)

    async def test_combined_xml_over_limit_is_rejected(self):
        async def defaults(_):
            return {**DEFAULTS, "rules": 'r' * 5000}

        async def no_telemetry(_):
            return None

        with patch('app.core.webui_get_defaults', defaults), patch('app.core.send_telemetry', no_telemetry):
            with self.assertRaises(HTTPException) as caught:
                await decide(DecisionRequest(history='h' * 15000))
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn('estado supera el límite de 20000', caught.exception.detail)


if __name__ == '__main__':
    unittest.main()
