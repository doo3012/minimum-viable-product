using FluentValidation;
namespace Api.Features.Companies.Onboard;

public class OnboardValidator : AbstractValidator<OnboardCommand>
{
    public OnboardValidator()
    {
        RuleFor(x => x.CompanyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(500);
        RuleFor(x => x.ContactNumber).NotEmpty().MaximumLength(20);
    }
}
