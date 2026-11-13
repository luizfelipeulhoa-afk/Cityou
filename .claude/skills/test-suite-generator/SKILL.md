---
name: test-suite-generator
description: "Gera automaticamente suítes de teste abrangentes para código Python — testes unitários, de integração e de caso extremo, formato pytest. Use pra tirar a fricção de escrever testes do zero."
---

# Test Suite Generator

Gera testes abrangentes automaticamente, formato pytest (mesmo padrão já usado em `the_eye/server/testes/test_server.py`).

## O que gera
✅ Testes unitários (nível função) · ✅ Testes de integração (nível módulo) · ✅ Testes de caso extremo (entradas estranhas) · ✅ Testes de tratamento de erro · ✅ Testes de performance (cumpre SLA?) · ✅ Fixtures de teste (dados de teste)

## Exemplo

Entrada: função `analyze_landing.py`

Suíte gerada:
```python
class TestAnalyzeLanding:

    def test_valid_input(self):
        result = analyze_landing(video_data)
        assert result.ankle_angle == 22

    def test_edge_case_minimal_angle(self):
        result = analyze_landing(15_degree_video)
        assert 15 <= result.ankle_angle <= 25

    def test_invalid_video_format(self):
        with pytest.raises(ValueError):
            analyze_landing(corrupted_video)

    def test_missing_frames(self):
        result = analyze_landing(partial_video)
        assert result is not None

    def test_performance(self):
        start = time.time()
        analyze_landing(video)
        assert time.time() - start < 5.0
```

Resultado: suíte com casos felizes + limite + erro + performance, pronta pra rodar com pytest.

## Recursos
✅ Geração automática de teste · ✅ Foco em cobertura completa · ✅ Casos extremos incluídos · ✅ Cenários de erro testados · ✅ Benchmarks de performance · ✅ Formato pytest-ready · ✅ Dados de teste incluídos

## Nota importante
Gera o rascunho da suíte — sempre rodar (`pytest` ou o `test_server.py` existente) antes de considerar coberto, nunca assumir que o teste gerado passa sem executar.